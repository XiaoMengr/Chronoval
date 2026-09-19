/** 相簿照片展示布局类型 */
export const ALBUM_LAYOUTS = ['waterfall', 'grid', 'immersive', 'timeline'] as const
export type AlbumLayout = (typeof ALBUM_LAYOUTS)[number]

export const isAlbumLayout = (v: unknown): v is AlbumLayout =>
  typeof v === 'string' && (ALBUM_LAYOUTS as readonly string[]).includes(v)