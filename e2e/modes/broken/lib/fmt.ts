import { connection } from '../server/db.server';

export const format = (value: number) => `${connection.length}:${value}`;
