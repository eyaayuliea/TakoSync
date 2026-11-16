export type OwnerActivityRecord = {
  id: string;
  date: string;
};

export function sortOwnerActivities<T extends OwnerActivityRecord>(activities: T[]): T[] {
  return [...activities].sort((left, right) => {
    const dateDifference = new Date(right.date).getTime() - new Date(left.date).getTime();
    return dateDifference || right.id.localeCompare(left.id);
  });
}

export function findOwnerActivity<T extends OwnerActivityRecord>(activities: T[], id: string): T | null {
  return activities.find((activity) => activity.id === id) ?? null;
}
