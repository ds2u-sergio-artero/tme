import { Task } from './task.js';

export function addTag(task: Task, tag: string, now: Date): Task {
  if (task.tags.includes(tag)) return task;
  return { ...task, tags: [...task.tags, tag], updatedAt: now };
}

export function removeTag(task: Task, tag: string, now: Date): Task {
  if (!task.tags.includes(tag)) return task;
  return { ...task, tags: task.tags.filter((t) => t !== tag), updatedAt: now };
}
