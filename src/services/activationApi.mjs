import { createTokenAxiosClient } from './axiosClient.mjs';

// This service already uses its own anonymous form contract. Do not forward
// the application's session token or inherit global Axios credentials.
export const activationApi = createTokenAxiosClient();
