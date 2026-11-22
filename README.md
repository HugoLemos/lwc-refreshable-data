# lwc-refreshable-data

Keeps custom Lightning web components fresh after saves, across console tabs and after server-side changes.

| Piece | What it does |
| --- | --- |
| `lwc/refreshableData` | The mixin every data component extends |
| `lwc/accountContactsCard` | An example consumer |
| `aura/refreshViewBridge` | Fires `force:refreshView` so standard components re-read |
| `RecordRefresh__e` + three channels | Server-side refreshes, one filtered channel per domain |
| `RecordRefresh__c` | Browser-side refreshes across workspace tabs |
| `RecordRefreshSubscriber` | Read on the event, which listeners need |

Article: [Fresh by default: one mixin for every custom LWC](article/article.md)

## Deploy

```bash
sf project deploy start --source-dir force-app --target-org <alias>
```

Assign the Record Refresh Subscriber permission set to users whose pages listen for server-side changes.

## Test

```bash
npm install
npm test
```

## Diagrams

```bash
cd article/diagrams && npm install && npm run build
```
