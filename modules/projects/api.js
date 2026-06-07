import { getData } from '/shell/api.js';

/**
 * Read-only API for other modules to consume Projects data.
 * Returns the full state for a given Projects instance.
 */
export async function getProjectState(instanceId) {
  return await getData('projects', instanceId) || null;
}

export async function getProjectMeta(instanceId) {
  const state = await getProjectState(instanceId);
  return state?.projectMeta || {};
}

export async function getMemberMeta(instanceId) {
  const state = await getProjectState(instanceId);
  return state?.memberMeta || {};
}
