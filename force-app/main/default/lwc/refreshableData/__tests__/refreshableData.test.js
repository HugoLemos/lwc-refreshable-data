import { createElement, LightningElement } from 'lwc';
import { RefreshEvent, registerRefreshHandler, unregisterRefreshHandler } from 'lightning/refresh';
import { subscribe as subscribeToEvents, unsubscribe as unsubscribeFromEvents } from 'lightning/empApi';
import { APPLICATION_SCOPE, MessageContext, publish, subscribe, unsubscribe } from 'lightning/messageService';
import { notifyRecordUpdateAvailable } from 'lightning/uiRecordApi';
import { RefreshableData, REFRESH_CHANNELS } from 'c/refreshableData';

const RECORD_ID = '001000000000001AAA';
const OTHER_RECORD_ID = '001000000000002AAA';
const REFRESH_EVENT = new RefreshEvent().type;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const refresh = jest.fn().mockResolvedValue();
const onEvent = jest.fn();

let card;
class Card extends RefreshableData(LightningElement) {
    constructor() {
        super();
        card = this;
    }
    get refreshers() {
        return [refresh];
    }
    get shownRecordIds() {
        return [RECORD_ID];
    }
    get refreshOnEventTypes() {
        return ['STATUS_CHANGED'];
    }
    onRecordRefreshEvent(payload) {
        onEvent(payload);
    }
}

class SalesCard extends RefreshableData(LightningElement) {
    get refreshChannel() {
        return REFRESH_CHANNELS.SALES;
    }
}

let finishRead;
const slowRefresh = jest.fn(
    () =>
        new Promise((resolve) => {
            finishRead = resolve;
        })
);
class SlowCard extends RefreshableData(LightningElement) {
    get refreshers() {
        return [slowRefresh];
    }
}

// Misuses the API: sends a refresh while handling one.
class EchoingCard extends RefreshableData(LightningElement) {
    get refreshers() {
        return [refresh];
    }
    get shownRecordIds() {
        return [RECORD_ID];
    }
    async refreshData() {
        await super.refreshData();
        this.refreshView();
    }
}

const mount = (Component) => {
    const element = createElement('c-card', { is: Component });
    document.body.appendChild(element);
    return element;
};
const refreshHandler = () => registerRefreshHandler.mock.calls.at(-1)[1];
const deliverEvent = (payload) => subscribeToEvents.mock.calls.at(-1)[2]({ data: { payload } });
const deliverMessage = (message) => subscribe.mock.calls.at(-1)[2](message);

describe('c-refreshable-data', () => {
    let sentRefreshEvents;
    let consoleError;

    beforeEach(() => {
        sentRefreshEvents = jest.fn();
        document.addEventListener(REFRESH_EVENT, sentRefreshEvents);
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        document.removeEventListener(REFRESH_EVENT, sentRefreshEvents);
        consoleError.mockRestore();
        document.body.innerHTML = '';
        jest.clearAllMocks();
    });

    describe('listening', () => {
        it('re-reads on a RefreshEvent and lets the refresh carry on down the page', async () => {
            mount(Card);
            const [component, handler] = registerRefreshHandler.mock.calls[0];

            expect(component).toBe(card);
            await expect(handler()).resolves.toBe(true);
            expect(notifyRecordUpdateAvailable).toHaveBeenCalledWith([{ recordId: RECORD_ID }]);
            expect(refresh).toHaveBeenCalledTimes(1);
        });

        it('listens on the default channel, or on the one a component names', () => {
            mount(Card);
            mount(SalesCard);

            expect(subscribeToEvents.mock.calls.map(([channel, replayId]) => [channel, replayId])).toEqual([
                [REFRESH_CHANNELS.DEFAULT, -1],
                [REFRESH_CHANNELS.SALES, -1]
            ]);
        });

        it('listens for messages from the whole app, not just the active tab', () => {
            mount(Card);

            expect(subscribe.mock.calls[0][3]).toEqual({ scope: APPLICATION_SCOPE });
        });
    });

    describe('platform events', () => {
        it('re-reads for an event naming a shown record, or no record', async () => {
            mount(Card);

            deliverEvent({ RecordId__c: OTHER_RECORD_ID });
            await flush();
            expect(refresh).not.toHaveBeenCalled();

            deliverEvent({ RecordId__c: RECORD_ID });
            await flush();
            deliverEvent({});
            await flush();
            expect(refresh).toHaveBeenCalledTimes(2);
        });

        it('hands a typed event to the hook, and re-reads only for a listed type', async () => {
            mount(Card);

            deliverEvent({ RecordId__c: RECORD_ID, Type__c: 'DOCUMENT_READY' });
            await flush();
            expect(onEvent).toHaveBeenCalledWith({ RecordId__c: RECORD_ID, Type__c: 'DOCUMENT_READY' });
            expect(refresh).not.toHaveBeenCalled();

            deliverEvent({ RecordId__c: RECORD_ID, Type__c: 'STATUS_CHANGED' });
            await flush();
            expect(refresh).toHaveBeenCalledTimes(1);
        });
    });

    describe('messages from other components', () => {
        it('re-reads for a message naming a shown record', async () => {
            mount(Card);

            deliverMessage({ recordIds: [OTHER_RECORD_ID], source: 'another' });
            await flush();
            expect(refresh).not.toHaveBeenCalled();

            deliverMessage({ recordIds: [OTHER_RECORD_ID, RECORD_ID], source: 'another' });
            await flush();
            expect(refresh).toHaveBeenCalledTimes(1);
        });

        it('ignores its own message', async () => {
            mount(Card);
            card.refreshView();

            deliverMessage(publish.mock.calls[0][2]);
            await flush();
            expect(refresh).not.toHaveBeenCalled();
        });
    });

    describe('refreshView()', () => {
        it('tells LDS, the page and other workspace tabs, through the wired message context', () => {
            mount(Card);
            const context = { id: 'message-context' };
            MessageContext.emit(context);

            card.refreshView();

            expect(notifyRecordUpdateAvailable).toHaveBeenCalledWith([{ recordId: RECORD_ID }]);
            expect(sentRefreshEvents).toHaveBeenCalledTimes(1);
            expect(publish).toHaveBeenCalledWith(context, expect.anything(), {
                recordIds: [RECORD_ID],
                source: expect.any(String)
            });
        });

        it('sends nothing while handling a refresh, and reads once more instead', async () => {
            mount(EchoingCard);

            await refreshHandler()();
            await flush();

            expect(refresh).toHaveBeenCalledTimes(2);
            expect(sentRefreshEvents).not.toHaveBeenCalled();
            expect(publish).not.toHaveBeenCalled();
            expect(consoleError).toHaveBeenCalledTimes(2);
        });

        it('sends again once the refresh it was handling is over', async () => {
            mount(Card);

            await refreshHandler()();
            card.refreshView();

            expect(sentRefreshEvents).toHaveBeenCalledTimes(1);
            expect(publish).toHaveBeenCalledTimes(1);
        });
    });

    describe('received refreshes', () => {
        it('run one read at a time, with at most one queued behind it', async () => {
            mount(SlowCard);
            const handler = refreshHandler();

            const reads = [handler(), handler(), handler()];
            await flush();
            expect(slowRefresh).toHaveBeenCalledTimes(1);

            finishRead();
            await flush();
            expect(slowRefresh).toHaveBeenCalledTimes(2);

            finishRead();
            await expect(Promise.all(reads)).resolves.toEqual([true, true, true]);
            expect(slowRefresh).toHaveBeenCalledTimes(2);
        });
    });

    describe('disconnecting', () => {
        it('unregisters and unsubscribes everything', async () => {
            const subscription = { channel: REFRESH_CHANNELS.DEFAULT };
            subscribeToEvents.mockResolvedValueOnce(subscription);
            const element = mount(Card);
            await flush();

            document.body.removeChild(element);

            expect(unregisterRefreshHandler).toHaveBeenCalledWith(registerRefreshHandler.mock.results[0].value);
            expect(unsubscribe).toHaveBeenCalledWith(subscribe.mock.results[0].value);
            expect(unsubscribeFromEvents).toHaveBeenCalledWith(subscription, expect.any(Function));
        });

        it('unsubscribes a subscription that resolves after the component is gone', async () => {
            let resolveSubscribe;
            subscribeToEvents.mockReturnValueOnce(
                new Promise((resolve) => {
                    resolveSubscribe = resolve;
                })
            );
            const element = mount(Card);
            document.body.removeChild(element);

            const late = { channel: REFRESH_CHANNELS.DEFAULT };
            resolveSubscribe(late);
            await flush();

            expect(unsubscribeFromEvents).toHaveBeenCalledWith(late, expect.any(Function));
        });
    });
});
