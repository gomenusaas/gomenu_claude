export type UploadedMedia = {
  kind: "image" | "video";
  path: string;
  posterPath: string | null;
  width: number | null;
  height: number | null;
  bytes: number;
};
