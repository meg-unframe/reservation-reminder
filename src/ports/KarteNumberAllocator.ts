/** カルテ番号の採番元。初期はこのシステムの連番、将来はサロンカルテ側の番号に差し替える。 */
export interface KarteNumberAllocator {
  next(): Promise<string>;
}
