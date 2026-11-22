import { createElement } from 'lwc';
import AccountContactsCard from 'c/accountContactsCard';
import { graphql } from 'lightning/graphql';
import { RefreshEvent, registerRefreshHandler } from 'lightning/refresh';
import { publish } from 'lightning/messageService';
import { notifyRecordUpdateAvailable, updateRecord } from 'lightning/uiRecordApi';

const ACCOUNT_ID = '001000000000001AAA';
const CONTACT_IDS = ['003000000000001AAA', '003000000000002AAA'];
const contactsResult = (nodes) => ({ uiapi: { query: { Contact: { edges: nodes.map((node) => ({ node })) } } } });
const CONTACTS = contactsResult([
    { Id: CONTACT_IDS[0], Name: { value: 'Jo Sample' }, Title: { value: 'Buyer' } },
    { Id: CONTACT_IDS[1], Name: { value: 'Max Example' }, Title: { value: null } }
]);

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const refresh = jest.fn().mockResolvedValue();

const mount = async (result = CONTACTS) => {
    const element = createElement('c-account-contacts-card', { is: AccountContactsCard });
    element.recordId = ACCOUNT_ID;
    document.body.appendChild(element);
    graphql.emit(result, undefined, refresh);
    await flush();
    return element;
};
const button = (element, contactId) => element.shadowRoot.querySelector(`lightning-button[data-id="${contactId}"]`);

describe('c-account-contacts-card', () => {
    let sentRefreshEvents;

    beforeEach(() => {
        sentRefreshEvents = jest.fn();
        document.addEventListener(new RefreshEvent().type, sentRefreshEvents);
    });

    afterEach(() => {
        document.removeEventListener(new RefreshEvent().type, sentRefreshEvents);
        document.body.innerHTML = '';
        jest.clearAllMocks();
    });

    it("lists the account's contacts to call", async () => {
        const element = await mount();

        expect(graphql.getLastConfig().variables).toEqual({ accountId: ACCOUNT_ID });
        expect([...element.shadowRoot.querySelectorAll('lightning-button')].map((b) => b.dataset.id)).toEqual(CONTACT_IDS);
        expect(element.shadowRoot.textContent).toContain('Jo Sample');
    });

    it('says so when no contact is left to call', async () => {
        const element = await mount(contactsResult([]));

        expect(element.shadowRoot.textContent).toContain('No contacts to call.');
    });

    it('marks a contact Do Not Call, then tells the page and other workspace tabs', async () => {
        const element = await mount();

        button(element, CONTACT_IDS[0]).click();
        await flush();

        expect(updateRecord).toHaveBeenCalledWith({ fields: { Id: CONTACT_IDS[0], DoNotCall: true } });
        expect(sentRefreshEvents).toHaveBeenCalledTimes(1);
        expect(publish.mock.calls[0][2]).toEqual({ recordIds: [ACCOUNT_ID, ...CONTACT_IDS], source: expect.any(String) });
    });

    it('shows why a save failed, and sends nothing', async () => {
        updateRecord.mockRejectedValueOnce({ body: { message: 'Insufficient access rights' } });
        const element = await mount();

        button(element, CONTACT_IDS[1]).click();
        await flush();

        expect(element.shadowRoot.textContent).toContain('Insufficient access rights');
        expect(sentRefreshEvents).not.toHaveBeenCalled();
        expect(publish).not.toHaveBeenCalled();
    });

    it('re-runs its query, and refetches what it shows, when the page refreshes', async () => {
        await mount();

        await registerRefreshHandler.mock.calls[0][1]();

        expect(notifyRecordUpdateAvailable).toHaveBeenCalledWith([ACCOUNT_ID, ...CONTACT_IDS].map((recordId) => ({ recordId })));
        expect(refresh).toHaveBeenCalledTimes(1);
    });
});
