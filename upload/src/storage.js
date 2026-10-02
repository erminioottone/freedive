const DB_NAME = 'ApneaTrainerDB';
const DB_VERSION = 1; // Preserve existing config, session and history stores.
let dbPromise;
let writeQueue = Promise.resolve();

function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => { dbPromise = null; reject(request.error); };
        request.onupgradeneeded = () => {
            const db = request.result;
            for (const name of ['config', 'session']) {
                if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('history')) {
                db.createObjectStore('history', { keyPath: 'id', autoIncrement: true })
                    .createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => { db.close(); dbPromise = null; };
            resolve(db);
        };
    });
    return dbPromise;
}

const completed = (transaction) => new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Saving was interrupted.'));
});

function write(stores, callback) {
    const operation = writeQueue.catch(() => {}).then(async () => {
        const db = await openDB();
        const tx = db.transaction(stores, 'readwrite');
        const done = completed(tx);
        callback(tx);
        await done;
    });
    writeQueue = operation;
    return operation;
}

export async function loadData(store, id = 'current') {
    await writeQueue.catch(() => {});
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const req = db.transaction(store, 'readonly').objectStore(store).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

export const saveConfig = (config) => write(['config'], (tx) => {
    const store = tx.objectStore('config');
    const previous = store.get('current');
    previous.onsuccess = () => {
        if (previous.result && ['co2', 'o2', 'fiph'].includes(previous.result.mode)) {
            store.put({ ...previous.result, id: 'mode-' + previous.result.mode });
        }
        store.put({ ...config, id: 'current' });
        store.put({ ...config, id: 'mode-' + config.mode });
    };
});

export const saveSession = (session) => write(['session'], (tx) => {
    // The session's own ID is retained inside its snapshot, alongside the singleton key.
    tx.objectStore('session').put({ id: 'current', snapshot: session, timestamp: Date.now() });
});

export const discardSession = () => write(['session'], (tx) => tx.objectStore('session').delete('current'));

export const saveFinishedSession = (record) => write(['history', 'session'], (tx) => {
    tx.objectStore('history').put(record);
    const sessions = tx.objectStore('session');
    const request = sessions.get('current');
    request.onsuccess = () => {
        // Editing an older log in another tab must not erase a newer session.
        if (request.result?.snapshot?.id === record.id) sessions.delete('current');
    };
});

export async function loadHistory(limit = 30) {
    await writeQueue.catch(() => {});
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const rows = [];
        const req = db.transaction('history', 'readonly').objectStore('history')
            .index('timestamp').openCursor(null, 'prev');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor || rows.length >= limit) return resolve(rows);
            rows.push(cursor.value);
            cursor.continue();
        };
    });
}
