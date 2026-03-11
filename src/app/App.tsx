export function App(): React.JSX.Element {
  return (
    <div className="flex h-screen flex-col">
      {/* Title bar area — Phase 3A fills this */}
      <header className="flex h-10 shrink-0 items-center border-b border-gray-800 px-4">
        <span className="text-sm font-medium text-gray-400">Consilium</span>
      </header>

      {/* Main content area — Phase 3A tiling windows fill this */}
      <main className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 items-center justify-center text-gray-600">
          <p className="text-lg">Council of Advisors</p>
        </div>
      </main>

      {/* Shared input bar — Phase 3C fills this */}
      <footer className="shrink-0 border-t border-gray-800 p-3">
        <div className="flex h-10 items-center rounded-lg border border-gray-700 bg-gray-900 px-4 text-sm text-gray-500">
          Shared input bar (Phase 3C)
        </div>
      </footer>
    </div>
  )
}
