export interface SessionUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string | undefined;
  onboardingCompleted?: boolean;
}

export interface UserRepository {
  upsertFromSession(user: SessionUser): Promise<SessionUser>;
  findById(id: string): Promise<SessionUser | undefined>;
  updateProfile?(
    id: string,
    input: {
      displayName?: string | undefined;
      username?: string | undefined;
      timezone?: string | undefined;
      bio?: string | undefined;
    },
  ): Promise<SessionUser>;
  deleteById?(id: string): Promise<boolean>;
}

export class DatabaseUnavailableError extends Error {
  constructor() {
    super('User persistence is not configured');
  }
}

export class UnconfiguredUserRepository implements UserRepository {
  async upsertFromSession(): Promise<SessionUser> {
    throw new DatabaseUnavailableError();
  }

  async findById(): Promise<SessionUser | undefined> {
    throw new DatabaseUnavailableError();
  }
}
