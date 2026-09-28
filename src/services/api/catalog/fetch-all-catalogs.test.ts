import { afterEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '@/store'
import { storeRawKey, removeRawKey } from '@/features/keys/key-vault'
import { fetchAllCatalogs, refreshProviderCatalog } from './fetch-all-catalogs'

const initial = useStore.getState()
const model = (id: string, isCustom = false) => ({ id, name: id, provider: 'openrouter' as const, contextWindow: 100, inputPricePerToken: 0, outputPricePerToken: 0, pricingKnown: true, isCustom })
afterEach(() => { useStore.setState(initial); removeRawKey('test-anthropic'); vi.unstubAllGlobals() })
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('shared catalog refresh', () => {
  it('keeps last good models on failure', async () => {
    useStore.getState().setCatalogModels('openrouter', [model('known')])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({}, 503)))
    expect((await refreshProviderCatalog('openrouter')).error).toBeDefined()
    expect(useStore.getState().catalogModels.openrouter.map((m) => m.id)).toEqual(['known'])
    expect(useStore.getState().catalogStatus.openrouter).toBe('error')
  })
  it('deduplicates overlapping requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ data: [{ id: 'fresh', name: 'Fresh' }] }))
    vi.stubGlobal('fetch', fetchMock)
    await Promise.all([refreshProviderCatalog('openrouter'), refreshProviderCatalog('openrouter')])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('preserves custom IDs across repeated refreshes while dropping stale provider entries', async () => {
    useStore.getState().setCatalogModels('openrouter', [model('custom', true), model('stale')])
    const fetchMock = vi.fn().mockResolvedValueOnce(reply({ data: [{ id: 'custom', name: 'Custom' }, { id: 'fresh', name: 'Fresh' }] }))
      .mockResolvedValueOnce(reply({ data: [{ id: 'fresh', name: 'Fresh' }] }))
    vi.stubGlobal('fetch', fetchMock)
    await refreshProviderCatalog('openrouter')
    await refreshProviderCatalog('openrouter')
    expect(useStore.getState().catalogModels.openrouter.map((m) => m.id)).toEqual(['custom', 'fresh'])
    expect(useStore.getState().catalogModels.openrouter[0]?.isCustom).toBe(true)
  })
  it('allows a new startup request after cancellation and rejects stale results', async () => {
    let finishFirst!: (response: Response) => void
    const first = new Promise<Response>((resolve) => { finishFirst = resolve })
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce(reply({ data: [{ id: 'new', name: 'New' }] })))
    const controller = new AbortController()
    const cancelled = refreshProviderCatalog('openrouter', controller.signal).catch(() => null)
    controller.abort()
    await refreshProviderCatalog('openrouter')
    finishFirst(reply({ data: [{ id: 'old', name: 'Old' }] }))
    await cancelled
    expect(useStore.getState().catalogModels.openrouter[0]?.id).toBe('new')
    expect(useStore.getState().catalogStatus.openrouter).toBe('loaded')
  })
  it('loads direct providers without waiting for OpenRouter and enriches after it arrives', async () => {
    storeRawKey('test-anthropic', 'test-key')
    useStore.getState().addKey({ id: 'test-anthropic', provider: 'anthropic', maskedKey: 'test', createdAt: 0, verified: true })
    let finishRouter!: (response: Response) => void
    const router = new Promise<Response>((resolve) => { finishRouter = resolve })
    const fetchMock = vi.fn().mockImplementation((url: string) => url.includes('openrouter')
      ? router : Promise.resolve(reply({ data: [{ id: 'claude-fable-5-1', display_name: 'Fable' }], has_more: false })))
    vi.stubGlobal('fetch', fetchMock)
    const loading = fetchAllCatalogs()
    await vi.waitFor(() => expect(useStore.getState().catalogStatus.anthropic).toBe('loaded'))
    finishRouter(reply({ data: [{ id: 'anthropic/claude-fable-5.1', name: 'Fable', pricing: { prompt: '0.00001', completion: '0.00005' }, context_length: 1000000 }] }))
    await loading
    expect(useStore.getState().catalogModels.anthropic[0]).toMatchObject({ pricingKnown: true, inputPricePerToken: 0.00001 })
  })
})
