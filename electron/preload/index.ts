import { contextBridge, ipcRenderer } from 'electron'
import type { ConsiliumAPI } from './types'

const api: ConsiliumAPI = {
  platform: process.platform,

  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),

  openFolder: (path) => ipcRenderer.invoke('open-folder', path),

  keysAvailable: () => ipcRenderer.invoke('keys:available'),
  keysLoad: () => ipcRenderer.invoke('keys:load'),
  keysSave: (providerId, rawKey, metadata) => ipcRenderer.invoke('keys:save', providerId, rawKey, metadata),
  keysDelete: (providerId) => ipcRenderer.invoke('keys:delete', providerId),

  adaptersLoad: () => ipcRenderer.invoke('adapters:load'),
  adaptersSave: (def) => ipcRenderer.invoke('adapters:save', def),
  adaptersDelete: (id) => ipcRenderer.invoke('adapters:delete', id),
  personasLoad: () => ipcRenderer.invoke('personas:load'),
  personasSave: (persona) => ipcRenderer.invoke('personas:save', persona),
  personasDelete: (id) => ipcRenderer.invoke('personas:delete', id),
  systemPromptsLoad: () => ipcRenderer.invoke('system-prompts:load'),
  systemPromptsSave: (entry) => ipcRenderer.invoke('system-prompts:save', entry),
  systemPromptsDelete: (id) => ipcRenderer.invoke('system-prompts:delete', id),
  compilePromptsLoad: () => ipcRenderer.invoke('compile-prompts:load'),
  compilePromptsSave: (entry) => ipcRenderer.invoke('compile-prompts:save', entry),
  compilePromptsDelete: (id) => ipcRenderer.invoke('compile-prompts:delete', id),
  compactPromptsLoad: () => ipcRenderer.invoke('compact-prompts:load'),
  compactPromptsSave: (entry) => ipcRenderer.invoke('compact-prompts:save', entry),
  compactPromptsDelete: (id) => ipcRenderer.invoke('compact-prompts:delete', id),
  customProvidersLoad: () => ipcRenderer.invoke('custom-providers:load'),
  customProvidersSave: (providers) => ipcRenderer.invoke('custom-providers:save', providers),
  customModelsLoad: () => ipcRenderer.invoke('custom-models:load'),
  customModelsSave: (models) => ipcRenderer.invoke('custom-models:save', models),
  customModelsAdd: (provider, modelId) => ipcRenderer.invoke('custom-models:add', provider, modelId),
  documentsLoad: (id) => ipcRenderer.invoke('documents:load', id),
  documentsSave: (doc) => ipcRenderer.invoke('documents:save', doc),
  documentsDelete: (id) => ipcRenderer.invoke('documents:delete', id),
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowIsMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  onMenuAction: (callback) => {
    // Allowlist of channels the renderer subscribes to from the main
    // process. Anything emitted on a channel NOT in this list is silently
    // dropped by ipcRenderer.on, so omissions are invisible failures —
    // every channel the main-process menu fires must be listed here.
    //
    // 'menu:configuration' is the new unified entry point. The legacy
    // menu:edit-config / compile-settings / auto-compaction-settings
    // channels remain listed so the in-app TitleBar deep links and any
    // historical IPC emissions keep working through the rollout.
    // compile-settings and auto-compaction-settings channels were
    // removed in task #23 when those panes became native inside
    // ConfigurationModal. The main-process menu no longer emits
    // them. 'menu:edit-config' remains until task #25 ports the raw
    // JSON editor into the Advanced pane.
    const actions = [
      'menu:new-consilium',
      'menu:save-session',
      'menu:set-budget',
      'menu:configuration',
      'menu:edit-config',
      'menu:about',
    ]
    const handlers = actions.map((action) => {
      const handler = () => callback(action)
      ipcRenderer.on(action, handler)
      return { action, handler }
    })
    return () => {
      for (const { action, handler } of handlers) {
        ipcRenderer.removeListener(action, handler)
      }
    }
  },
  configLoad: () => ipcRenderer.invoke('config:load'),
  configSave: (config) => ipcRenderer.invoke('config:save', config),
  catalogPrefsLoad: () => ipcRenderer.invoke('catalog-prefs:load'),
  catalogPrefsSave: (data) => ipcRenderer.invoke('catalog-prefs:save', data),
  openFileDialog: (filters) => ipcRenderer.invoke('dialog:open-file', filters),
  saveFileDialog: (defaultName, content, filters) => ipcRenderer.invoke('dialog:save-file', defaultName, content, filters),
  sessionSave: (id, content) => ipcRenderer.invoke('session:save', id, content),
  sessionLoad: (id) => ipcRenderer.invoke('session:load', id),
  sessionList: () => ipcRenderer.invoke('session:list'),
  sessionDelete: (id) => ipcRenderer.invoke('session:delete', id),
  toggleDevTools: () => ipcRenderer.invoke('window:toggle-devtools'),
  sessionSaveSync: (id, content) => ipcRenderer.sendSync('session:save-sync', id, content) as boolean,
}

contextBridge.exposeInMainWorld('consiliumAPI', api)
