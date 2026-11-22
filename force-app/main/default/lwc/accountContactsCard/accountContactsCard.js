import { LightningElement, api, wire } from 'lwc';
import { gql, graphql } from 'lightning/graphql';
import { updateRecord } from 'lightning/uiRecordApi';
import { RefreshableData } from 'c/refreshableData';

export default class AccountContactsCard extends RefreshableData(LightningElement) {
    @api recordId;
    contacts;
    error;
    refreshContacts;

    @wire(graphql, {
        query: gql`
            query contactsToCall($accountId: ID) {
                uiapi {
                    query {
                        Contact(
                            where: { and: [{ AccountId: { eq: $accountId } }, { DoNotCall: { eq: false } }] }
                            orderBy: { Name: { order: ASC } }
                            first: 50
                        ) {
                            edges {
                                node {
                                    Id
                                    Name {
                                        value
                                    }
                                    Title {
                                        value
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `,
        variables: '$variables'
    })
    wiredContacts({ data, errors, refresh }) {
        this.refreshContacts = refresh;
        if (data) {
            this.contacts = data.uiapi.query.Contact.edges.map(({ node }) => ({
                id: node.Id,
                name: node.Name.value,
                title: node.Title.value
            }));
        }
        this.error = errors?.map((error) => error.message).join(', ');
    }

    get variables() {
        return { accountId: this.recordId };
    }

    get refreshers() {
        return [this.refreshContacts];
    }

    get shownRecordIds() {
        return [this.recordId, ...(this.contacts ?? []).map((contact) => contact.id)];
    }

    get isEmpty() {
        return this.contacts?.length === 0;
    }

    async handleDoNotCall(event) {
        const contactId = event.target.dataset.id;
        try {
            await updateRecord({ fields: { Id: contactId, DoNotCall: true } });
            // LDS updates the contact's values everywhere but doesn't re-run list queries: this one still lists it.
            this.refreshView();
        } catch (error) {
            this.error = error.body?.message ?? error.message;
        }
    }
}
