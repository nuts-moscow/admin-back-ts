export interface AdminUser {
  id: number;
  username: string;
  passwordHash: string;
  createdAt: Date;
}
