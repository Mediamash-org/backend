/** Types mirrored from NetMirror-Extension NetMirrorProvider.kt (net27 / aoneroom APIs). */

export interface Net27VariantsResponse {
  ok?: boolean
  defaultSubjectId?: string
  defaultDetailPath?: string
  variants?: Net27Variant[]
}

export interface Net27Variant {
  language?: string
  dubSubjectId?: string
}

export interface AoneRoomResponse {
  data?: {
    subject?: {
      dubs?: Array<{ subjectId?: string; detailPath?: string }>
    }
  }
}

export interface Net27Response {
  ok?: boolean
  mp4?: string
  resolution?: number | string
  streams?: Net27Stream[]
  captions?: Net27Caption[]
}

export interface Net27Stream {
  url: string
  resolution: number
}

export interface Net27Caption {
  lang?: string
  name?: string
  url: string
}
