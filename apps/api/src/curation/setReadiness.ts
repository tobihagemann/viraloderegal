// A curated set is ready for play when every member exists, is enabled, and carries a view-count snapshot.
// Pure so it unit-tests without a database; callers look up the DB rows and pass the state map.

export interface SetVideoState {
  enabled: boolean;
  viewCountSnapshot: number | null;
}

// Returns the offending youtube ids in order — those missing, disabled, or snapshot-less. Empty when ready.
export function findUnreadyVideos(videoOrder: string[], videosById: Map<string, SetVideoState>): string[] {
  return videoOrder.filter((id) => {
    const video = videosById.get(id);
    return !video || !video.enabled || video.viewCountSnapshot === null;
  });
}
