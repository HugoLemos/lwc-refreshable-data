({
    // force:refreshView doesn't support repeated firing: a burst becomes one refresh, after its last event.
    BURST_MS: 300,

    subscribe: function (component) {
        var helper = this;
        var empApi = component.find("empApi");
        empApi.onError(
            $A.getCallback(function (error) {
                console.error("Refresh view bridge: subscription error", error);
            })
        );
        empApi
            .subscribe(
                component.get("v.channel"),
                -1,
                $A.getCallback(function (message) {
                    helper.handleEvent(component, message);
                })
            )
            .then(
                $A.getCallback(function (subscription) {
                    // Destroyed before subscribe resolved: handleEvent ignores what still arrives.
                    if (component.isValid()) {
                        component.set("v.subscription", subscription);
                    }
                })
            );
    },

    unsubscribe: function (component) {
        window.clearTimeout(component.get("v.pendingRefresh"));
        var subscription = component.get("v.subscription");
        if (subscription) {
            component.find("empApi").unsubscribe(subscription, function () {});
        }
    },

    // Untyped events naming this record only. A typed event is a notification; a blank record id is a
    // broadcast, which would reload every open record page.
    handleEvent: function (component, message) {
        var payload = (message && message.data && message.data.payload) || {};
        var recordId = component.isValid() && component.get("v.recordId");
        if (recordId && !payload.Type__c && payload.RecordId__c === recordId) {
            this.scheduleRefresh(component);
        }
    },

    scheduleRefresh: function (component) {
        window.clearTimeout(component.get("v.pendingRefresh"));
        component.set(
            "v.pendingRefresh",
            window.setTimeout(
                $A.getCallback(function () {
                    if (component.isValid()) {
                        $A.get("e.force:refreshView").fire();
                    }
                }),
                this.BURST_MS
            )
        );
    }
});
