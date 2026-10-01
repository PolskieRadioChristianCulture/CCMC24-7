const BASE = 'https://firestore.googleapis.com/v1/projects/';

function scalar(field) {
  return field?.stringValue ?? field?.timestampValue ?? field?.integerValue ?? field?.booleanValue ?? null;
}

export class FirebaseReader {
  constructor(env = process.env, request = fetch) { this.env = env; this.request = request; }
  async read(project, collection, id, tokenName) {
    const token = this.env[tokenName];
    if (!token) throw new Error(`NOT_CONNECTED: configure ${tokenName} privately on the host. No anonymous fallback.`);
    const path = `${BASE}${project}/databases/(default)/documents/${collection}${id ? '/' + encodeURIComponent(id) : '?pageSize=50'}`;
    let response;
    try {
      response = await this.request(path, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000), redirect: 'error'
      });
    } catch { throw new Error('FIRESTORE_NETWORK_ERROR'); }
    if (!response.ok) throw new Error(`FIRESTORE_HTTP_${response.status}: no success claimed; check identity, expiry and deployed rules.`);
    return response.json();
  }
  async missionTasks() {
    const data = await this.read('cc-mission-control', 'CommandQueue', null, 'CC_MC_FIREBASE_ID_TOKEN');
    return { scope: 'REMOTE_MISSION_CONTROL', fetchedAt: new Date().toISOString(),
      partial: Boolean(data.nextPageToken), tasks: (data.documents ?? []).map(doc => ({
        id: doc.name.split('/').pop(), command: scalar(doc.fields?.command),
        status: scalar(doc.fields?.status), timestamp: scalar(doc.fields?.timestamp)
      })) };
  }
  async publicPost(id) {
    const doc = await this.read('lumina-cc', 'lumina_posts', id, 'CC_LUMINA_FIREBASE_ID_TOKEN');
    // Fail closed. Do not expose private messages, profiles or posts with unknown visibility.
    const visibility = scalar(doc.fields?.visibility);
    if (!['PUBLIC', 'public'].includes(visibility)) throw new Error('POST_VISIBILITY_NOT_PUBLIC: access is intentionally limited to explicitly public posts.');
    return { id, scope: 'REMOTE_LUMINA', visibility, title: scalar(doc.fields?.title),
      text: scalar(doc.fields?.text), content: scalar(doc.fields?.content), fetchedAt: new Date().toISOString() };
  }
}
