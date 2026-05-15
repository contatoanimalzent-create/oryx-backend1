/**
 * Public response from POST /mqtt/credentials. Mobile clients connect to
 * `url` (WSS) using `clientId` (== operator id == IoT thing name) and may
 * publish only under `topicPrefix`. The `mode` field tells the client
 * whether they're talking to a real AWS IoT Core endpoint or a stub.
 */
export interface MqttCredentialsView {
  url: string;
  clientId: string;
  topicPrefix: string;
  expiresAt: string;
  mode: 'stub' | 'aws';
  awsCredentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    region: string;
  };
}
