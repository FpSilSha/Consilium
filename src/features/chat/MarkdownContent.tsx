import { type ReactNode, useState, useMemo, type ComponentPropsWithoutRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

interface MarkdownContentProps {
  readonly content: string
}

/**
 * Renders message content as rich markdown with:
 * - GFM support (tables, strikethrough, task lists)
 * - Syntax-highlighted code blocks
 * - Inline images (URLs and base64 data URIs)
 * - HTML preview toggle for html code blocks
 */
export function MarkdownContent({ content }: MarkdownContentProps): ReactNode {
  // If the content is very short and has no markdown indicators, skip parsing
  const hasMarkdown = useMemo(() => /[*_`#\[!\-|>]/.test(content), [content])

  if (!hasMarkdown) {
    return <span>{content}</span>
  }

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={COMPONENTS}
    >
      {content}
    </ReactMarkdown>
  )
}

/**
 * Custom component overrides for react-markdown.
 * Applies theme-consistent styling and adds special behaviors.
 */
const COMPONENTS = {
  // Paragraphs
  p: ({ children }: ComponentPropsWithoutRef<'p'>) => (
    <p className="mb-2 last:mb-0">{children}</p>
  ),

  // Headings
  h1: ({ children }: ComponentPropsWithoutRef<'h1'>) => (
    <h1 className="mb-2 mt-3 text-base font-bold text-content-primary first:mt-0">{children}</h1>
  ),
  h2: ({ children }: ComponentPropsWithoutRef<'h2'>) => (
    <h2 className="mb-2 mt-3 text-sm font-bold text-content-primary first:mt-0">{children}</h2>
  ),
  h3: ({ children }: ComponentPropsWithoutRef<'h3'>) => (
    <h3 className="mb-1 mt-2 text-sm font-semibold text-content-primary first:mt-0">{children}</h3>
  ),

  // Code blocks
  pre: ({ children }: ComponentPropsWithoutRef<'pre'>) => (
    <PreBlock>{children}</PreBlock>
  ),

  // Inline code
  code: ({ className, children, ...props }: ComponentPropsWithoutRef<'code'>) => {
    // If inside a <pre>, let PreBlock handle it
    if (className?.startsWith('hljs') || className?.startsWith('language-')) {
      return <code className={className} {...props}>{children}</code>
    }
    return (
      <code className="rounded bg-surface-active px-1 py-0.5 text-[0.85em] text-accent-blue">
        {children}
      </code>
    )
  },

  // Links
  a: ({ href, children }: ComponentPropsWithoutRef<'a'>) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent-blue underline hover:text-accent-blue/80"
    >
      {children}
    </a>
  ),

  // Images — supports URLs and base64 data URIs
  img: ({ src, alt }: ComponentPropsWithoutRef<'img'>) => (
    <img
      src={src}
      alt={alt ?? ''}
      className="my-2 max-h-80 max-w-full rounded-md border border-edge-subtle"
      loading="lazy"
    />
  ),

  // Lists
  ul: ({ children }: ComponentPropsWithoutRef<'ul'>) => (
    <ul className="mb-2 ml-4 list-disc space-y-0.5">{children}</ul>
  ),
  ol: ({ children }: ComponentPropsWithoutRef<'ol'>) => (
    <ol className="mb-2 ml-4 list-decimal space-y-0.5">{children}</ol>
  ),
  li: ({ children }: ComponentPropsWithoutRef<'li'>) => (
    <li className="text-sm">{children}</li>
  ),

  // Blockquotes
  blockquote: ({ children }: ComponentPropsWithoutRef<'blockquote'>) => (
    <blockquote className="my-2 border-l-2 border-accent-blue/50 pl-3 italic text-content-muted">
      {children}
    </blockquote>
  ),

  // Tables
  table: ({ children }: ComponentPropsWithoutRef<'table'>) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }: ComponentPropsWithoutRef<'th'>) => (
    <th className="border border-edge-subtle bg-surface-hover px-2 py-1 text-left font-medium text-content-primary">
      {children}
    </th>
  ),
  td: ({ children }: ComponentPropsWithoutRef<'td'>) => (
    <td className="border border-edge-subtle px-2 py-1 text-content-muted">{children}</td>
  ),

  // Horizontal rule
  hr: () => <hr className="my-3 border-edge-subtle" />,

  // Strong/emphasis
  strong: ({ children }: ComponentPropsWithoutRef<'strong'>) => (
    <strong className="font-semibold text-content-primary">{children}</strong>
  ),
}

/**
 * Code block wrapper with copy button and HTML preview toggle.
 */
function PreBlock({ children }: { readonly children: ReactNode }): ReactNode {
  const [copied, setCopied] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  // Extract raw text from children for copy and preview
  const rawText = useMemo(() => extractText(children), [children])

  // Detect if this is an HTML code block
  const isHtml = useMemo(() => {
    const childEl = children as { props?: { className?: string; children?: string } }
    const className = childEl?.props?.className ?? ''
    return className.includes('html') || (rawText.trimStart().startsWith('<') && rawText.includes('</'))
  }, [children, rawText])

  const handleCopy = () => {
    navigator.clipboard.writeText(rawText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }

  return (
    <div className="group relative my-2 rounded-md border border-edge-subtle bg-surface-base">
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-1 border-b border-edge-subtle px-2 py-0.5">
        {isHtml && (
          <button
            onClick={() => setShowPreview((v) => !v)}
            className="text-[10px] text-content-disabled transition-colors hover:text-content-muted"
          >
            {showPreview ? 'Code' : 'Preview'}
          </button>
        )}
        <button
          onClick={handleCopy}
          className="text-[10px] text-content-disabled transition-colors hover:text-content-muted"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Content */}
      {showPreview && isHtml ? (
        <div className="p-3">
          <iframe
            srcDoc={rawText}
            sandbox="allow-scripts"
            className="h-64 w-full rounded border border-edge-subtle bg-white"
            title="HTML Preview"
          />
        </div>
      ) : (
        <pre className="overflow-x-auto p-3 text-xs leading-relaxed">{children}</pre>
      )}
    </div>
  )
}

/** Recursively extracts text content from React children. */
function extractText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (typeof node === 'object' && 'props' in node) {
    return extractText((node as { props: { children?: ReactNode } }).props.children)
  }
  return ''
}
