import { installRandomUuid } from './frontend/services/randomUuid';

// Before anything renders: request ids need crypto.randomUUID, which browsers
// leave out when the app is opened by a network address instead of localhost.
installRandomUuid();

export { default } from './frontend/App';
