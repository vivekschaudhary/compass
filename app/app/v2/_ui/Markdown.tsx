// Agent output is markdown. Render it as markdown.
//
// The draft pane showed raw pipes for every table the agent wrote — `| Fact | Value |` and a row of
// dashes — because the body was rendered as pre-wrap text. The document was unreadable in the one
// place it exists to be read.
//
// react-markdown rather than a hand-rolled subset: this is agent-generated content, so the shapes
// are not knowable in advance, and a partial renderer fails silently on the one table that matters.
// Raw HTML is NOT enabled — the content comes from a model reading client documents, and there is
// no reason for it to inject markup.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className ? `md ${className}` : "md"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // A wide table scrolls inside its own box rather than pushing the page sideways.
          table: ({ children }) => <div className="md-scroll"><table>{children}</table></div>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
