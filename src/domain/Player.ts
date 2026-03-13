/** Player row from Postgres players table (minimal shape for nickname lookup) */
export interface Player {
  id: number;
  nickname: string;
}
