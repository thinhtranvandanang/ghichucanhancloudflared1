export interface Note {
  id: number;
  user_email: string;
  title: string;
  content: string;
  created_at: string;
}

export interface UserProfile {
  email: string;
  name: string;
}

export interface AuthSessionResponse {
  authenticated: boolean;
  mode: 'livemode' | 'testmode';
  clientId: string;
  loginUri: string;
  user?: UserProfile;
}
