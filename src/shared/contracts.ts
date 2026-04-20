export type ImmichConnectionMode = 'apiKey' | 'password';

export type ReviewState = 'keep' | 'pending_trash' | 'trashed' | 'trash_failed';

export type AssetKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'OTHER';

export type AppSettings = {
  yearsBack: number;
  timezone: string;
};

export type AssetStub = {
  id: string;
  type: AssetKind;
  originalFileName: string;
  originalMimeType?: string;
  fileCreatedAt: string;
  localDateTime: string;
  duration: string | null;
  width: number | null;
  height: number | null;
  thumbhash: string | null;
  isFavorite: boolean;
  isArchived: boolean;
};

export type FailedActionItem = {
  assetId: string;
  state: Extract<ReviewState, 'trash_failed'>;
  errorMessage: string | null;
  updatedAt: string;
  asset: AssetStub;
};

export type AppStateResponse = {
  bootstrapped: boolean;
  authenticated: boolean;
  hasImmichConnection: boolean;
  setupTokenRequired: boolean;
  csrfToken: string | null;
  settings: AppSettings;
  adminEmail: string | null;
  connectionMode: ImmichConnectionMode | null;
};

export type QueueResponse = {
  queueId: string;
  forDate: string;
  yearsBack: number;
  timezone: string;
  totalCount: number;
  completedCount: number;
  items: AssetStub[];
  failedActions: FailedActionItem[];
};

export type SetupApiKeyRequest = {
  baseUrl: string;
  apiKey: string;
  yearsBack: number;
  timezone: string;
};

export type SetupImmichLoginRequest = {
  baseUrl: string;
  email: string;
  password: string;
  yearsBack: number;
  timezone: string;
};

export type ApiKeyLoginRequest = {
  apiKey: string;
};

export type PasswordLoginRequest = {
  email: string;
  password: string;
};

export type UpdateSettingsRequest = {
  yearsBack: number;
  timezone: string;
};

export type ReviewActionRequest = {
  assetId: string;
  action: 'keep' | 'trash' | 'retry-trash';
  asset?: AssetStub;
  queueDate: string;
};

export type ReviewActionResponse = {
  state: ReviewState;
  errorMessage?: string | null;
};
