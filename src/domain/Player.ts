/** Player row from Postgres players table */
export interface Player {
  id: number;
  nickname: string;
  name: string | null;
  phone: string | null;
  tg: string | null;
  notes: string | null;
  signAgreement: boolean;
  freeEntryCount: number;
  freeReentryCount: number;
  createdAt: Date;
}

/** Input for creating a new player */
export interface CreatePlayerInput {
  nickname: string;
  name?: string | null;
  phone?: string | null;
  tg?: string | null;
  notes?: string | null;
  signAgreement?: boolean;
}

/** Input for updating a player (all fields optional) */
export interface UpdatePlayerInput {
  nickname?: string;
  name?: string | null;
  phone?: string | null;
  tg?: string | null;
  notes?: string | null;
  signAgreement?: boolean;
}
