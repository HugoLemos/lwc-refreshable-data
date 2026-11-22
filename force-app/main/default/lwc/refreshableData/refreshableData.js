import { wire } from 'lwc';
import { RefreshEvent, registerRefreshHandler, unregisterRefreshHandler } from 'lightning/refresh';
import { notifyRecordUpdateAvailable } from 'lightning/uiRecordApi';
import { subscribe as subscribeToEvents, unsubscribe as unsubscribeFromEvents } from 'lightning/empApi';
import { APPLICATION_SCOPE, MessageContext, publish, subscribe, unsubscribe } from 'lightning/messageService';
import RECORD_REFRESH from '@salesforce/messageChannel/RecordRefresh__c';

// One RecordRefresh__e channel per Domain__c value.
export const REFRESH_CHANNELS = {
    DEFAULT: '/event/DefaultRefresh__chn',
    SALES: '/event/SalesRefresh__chn',
    SERVICE: '/event/ServiceRefresh__chn'
};

let lastSourceId = 0;

/**
 * Keeps a data component fresh. Override `refreshers` and `shownRecordIds`, and call `refreshView()`
 * after the component's own save. Overriding connectedCallback or disconnectedCallback? Call super first.
 */
export const RefreshableData = (Base) =>
    class extends Base {
        @wire(MessageContext) refreshMessageContext;

        _connected = false;
        _sourceId = String(++lastSourceId);
        _refreshHandlerId;
        _eventSubscription;
        _messageSubscription;
        _receiving = 0;
        _read;
        _queuedRead;
        _extraReadQueued = false;

        connectedCallback() {
            super.connectedCallback?.();
            this._connected = true;
            // Lightning Locker orgs pass this.template.host and a bound handler instead.
            this._refreshHandlerId = registerRefreshHandler(this, () => this.receiveRefresh().then(() => true));
            this._messageSubscription = subscribe(
                this.refreshMessageContext,
                RECORD_REFRESH,
                (message) => this.handleRefreshMessage(message),
                { scope: APPLICATION_SCOPE }
            );
            subscribeToEvents(this.refreshChannel, -1, (response) => this.handleRefreshEvent(response))
                .then((subscription) => {
                    if (this._connected) {
                        this._eventSubscription = subscription;
                    } else {
                        // Disconnected before subscribe resolved: nothing else would unsubscribe it.
                        unsubscribeFromEvents(subscription, () => {});
                    }
                })
                .catch((error) => console.error(`Couldn't subscribe to ${this.refreshChannel}`, error));
        }

        disconnectedCallback() {
            super.disconnectedCallback?.();
            this._connected = false;
            unregisterRefreshHandler(this._refreshHandlerId);
            unsubscribe(this._messageSubscription);
            if (this._eventSubscription) {
                unsubscribeFromEvents(this._eventSubscription, () => {});
                this._eventSubscription = undefined;
            }
        }

        /** The functions that re-read this component's data: each GraphQL wire's `refresh`, or `() => refreshApex(this.wired)`. */
        get refreshers() {
            return [];
        }

        /** The records this component shows. Incoming refreshes are matched against them; outgoing ones name them. */
        get shownRecordIds() {
            return [];
        }

        /** The RecordRefresh__e channel this component listens on. */
        get refreshChannel() {
            return REFRESH_CHANNELS.DEFAULT;
        }

        /** Typed events (`Type__c`) that should also re-read this component. */
        get refreshOnEventTypes() {
            return [];
        }

        /** Override to react to a RecordRefresh__e that names a shown record, or none. Runs before any re-read. */
        onRecordRefreshEvent() {}

        /** Re-read now: refetch the shown records into the LDS cache, then run every refresher. */
        async refreshData() {
            const recordIds = this._recordIds();
            if (recordIds.length) {
                await notifyRecordUpdateAvailable(recordIds.map((recordId) => ({ recordId })));
            }
            const refreshers = (this.refreshers ?? []).filter((refresher) => typeof refresher === 'function');
            await Promise.all(refreshers.map((refresher) => refresher()));
        }

        /** After this component's own save: tell LDS, every refreshable component on the page, and other workspace tabs. */
        refreshView() {
            if (this._receiving) {
                console.error('refreshView() called while handling a refresh: nothing sent');
                this._readOnceMore();
                return;
            }
            const recordIds = this._recordIds();
            if (recordIds.length) {
                notifyRecordUpdateAvailable(recordIds.map((recordId) => ({ recordId }))).catch((error) =>
                    console.error('LDS record notice failed', error)
                );
                publish(this.refreshMessageContext, RECORD_REFRESH, { recordIds, source: this._sourceId });
            }
            this.dispatchEvent(new RefreshEvent());
        }

        handleRefreshEvent(response) {
            const payload = response?.data?.payload ?? {};
            if (payload.RecordId__c && !this._recordIds().includes(payload.RecordId__c)) {
                return;
            }
            this._receiving += 1;
            try {
                this.onRecordRefreshEvent(payload);
            } finally {
                this._receiving -= 1;
            }
            // A typed event is a notification, not a refresh, unless this component lists its type.
            if (!payload.Type__c || (this.refreshOnEventTypes ?? []).includes(payload.Type__c)) {
                this.receiveRefresh();
            }
        }

        handleRefreshMessage(message) {
            const shown = this._recordIds();
            if (message?.source !== this._sourceId && (message?.recordIds ?? []).some((id) => shown.includes(id))) {
                this.receiveRefresh();
            }
        }

        /** Re-read for a received refresh: one read at a time, at most one queued behind it. */
        receiveRefresh() {
            if (!this._read) {
                this._read = this._readWhileReceiving().finally(() => {
                    this._read = undefined;
                });
                return this._read;
            }
            if (!this._queuedRead) {
                this._queuedRead = this._read.then(() => {
                    this._queuedRead = undefined;
                    return this._connected ? this.receiveRefresh() : undefined;
                });
            }
            return this._queuedRead;
        }

        async _readWhileReceiving() {
            this._receiving += 1;
            try {
                await this.refreshData();
            } catch (error) {
                console.error('Refresh failed', error);
            } finally {
                this._receiving -= 1;
            }
        }

        // A save during a read isn't announced, which is what stops loops. Read once more so this component shows it.
        _readOnceMore() {
            if (this._extraReadQueued) {
                return;
            }
            this._extraReadQueued = true;
            this.receiveRefresh().then(() => {
                this._extraReadQueued = false;
            });
        }

        _recordIds() {
            return [...new Set((this.shownRecordIds ?? []).filter(Boolean))];
        }
    };
