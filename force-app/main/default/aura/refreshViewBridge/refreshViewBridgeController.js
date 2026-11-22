({
    onInit: function (component, event, helper) {
        helper.subscribe(component);
    },

    onDestroy: function (component, event, helper) {
        helper.unsubscribe(component);
    },

    // RecordRefresh__c: a component in some workspace tab saved these records.
    onMessage: function (component, message, helper) {
        var recordIds = message.getParam("recordIds") || [];
        if (component.isValid() && recordIds.indexOf(component.get("v.recordId")) !== -1) {
            helper.scheduleRefresh(component);
        }
    }
});
