import { Store } from './store.mjs';
const store = new Store(process.env.CC_DATA_DIR);
console.log(JSON.stringify({ memory: store.search({ limit: 100 }), tasks: store.tasks() }, null, 2));
store.close();
