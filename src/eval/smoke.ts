// The smoke run's tasks: a fixed dev task from each category, named in the
// config, so the machinery can be checked without spending a day's free limit.
import { CATEGORIES, type Task } from "../tasks/schema";

// Takes them from the dev tasks the loader handed out, so a holdout id can
// never get in. Throws, in plain words, unless there's exactly one per category.
export function pickSmokeTasks(devTasks: Task[], ids: string[]): Task[] {
  const byId = new Map(devTasks.map((t) => [t.id, t]));
  const picked: Task[] = [];
  for (const id of ids) {
    const task = byId.get(id);
    if (!task) throw new Error(`runner.smokeTasks names ${id}, which isn't a dev task. Pick dev task ids in verifai.config.json.`);
    if (picked.some((t) => t.category === task.category)) {
      throw new Error(`runner.smokeTasks has two ${task.category} tasks. It takes one per category; fix verifai.config.json.`);
    }
    picked.push(task);
  }
  const missing = CATEGORIES.filter((c) => !picked.some((t) => t.category === c));
  if (missing.length > 0) throw new Error(`runner.smokeTasks has no ${missing.join(" or ")} task. It takes one per category; fix verifai.config.json.`);
  return picked;
}
