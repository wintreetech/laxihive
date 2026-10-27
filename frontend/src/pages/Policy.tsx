import type { ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Printer } from "lucide-react";
import policies from "../content/policies.json";
import policyIndex from "../content/policy-index.json";
import { company } from "../content/company";

type Inline = { text: string; bold: boolean; italic: boolean; href: string | null };
type Paragraph = {
  kind: "paragraph" | "title" | "heading";
  id: string;
  level: number;
  text: string;
  inlines: Inline[];
};
type Table = { kind: "table"; rows: { cells: { blocks: Block[] }[] }[] };
type Block = Paragraph | Table;
type PolicyDocument = {
  path: string;
  title: string;
  blocks: Block[];
  footers: Paragraph[];
};

function safeHref(href: string | null) {
  if (!href) return undefined;
  return /^(https?:\/\/|mailto:|tel:|#)/i.test(href) ? href : undefined;
}

function RichText({ inlines }: { inlines: Inline[] }) {
  return inlines.map((run, index) => {
    let content: ReactNode = run.text;
    if (run.italic) content = <em>{content}</em>;
    if (run.bold) content = <strong>{content}</strong>;
    const href = safeHref(run.href);
    return href ? (
      <a key={index} href={href}>{content}</a>
    ) : (
      <span key={index}>{content}</span>
    );
  });
}

function DocumentBlock({ block }: { block: Block }) {
  if (block.kind === "table") {
    const singleCell = block.rows.length === 1 && block.rows[0].cells.length === 1;
    if (singleCell) {
      return <aside className="policy-callout">{block.rows[0].cells[0].blocks.map((child, index) => <DocumentBlock key={index} block={child} />)}</aside>;
    }
    return (
      <div className="policy-table-wrap">
        <table className="policy-table" aria-label="Policy information">
          <tbody>{block.rows.map((row, index) => (
            <tr key={index}>{row.cells.map((cell, cellIndex) => (
              <td key={cellIndex}>{cell.blocks.map((child, childIndex) => <DocumentBlock key={childIndex} block={child} />)}</td>
            ))}</tr>
          ))}</tbody>
        </table>
      </div>
    );
  }
  const Tag = block.kind === "title" ? "h1" : block.kind === "heading"
    ? (`h${Math.min(6, Math.max(2, block.level))}` as "h2" | "h3" | "h4" | "h5" | "h6")
    : "p";
  return (
    <Tag id={block.id} data-policy-source={block.id} className={`policy-${block.kind}`}>
      <RichText inlines={block.inlines} />
    </Tag>
  );
}

export default function Policy() {
  const { pathname } = useLocation();
  const document = (policies as PolicyDocument[]).find((item) => item.path === pathname);

  if (!document) return (
    <div className="page policy-hub">
      <Link className="text-link" to="/contact"><ArrowLeft size={15} />Contact LexiHive</Link>
      <header>
        <span className="eyebrow">POLICIES & COMPANY INFORMATION</span>
        <h1>Clear information. Confident play.</h1>
        <p>Read the policies that apply to your account, gameplay and digital purchases.</p>
      </header>
      <div className="policy-cards">{policyIndex.map((item, index) => (
        <Link key={item.path} to={item.path}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <h2>{item.title}</h2><ArrowUpRight size={20} aria-hidden="true" />
        </Link>
      ))}</div>
      <section className="policy-company" aria-labelledby="policy-company-title">
        <h2 id="policy-company-title">{company.name}</h2>
        <p>Company No. {company.number} · Registered in {company.jurisdiction}</p>
        <address>{company.address}</address>
        <p><a href={`mailto:${company.email}`}>{company.email}</a><br /><a href={company.phoneHref}>{company.phone}</a><br /><a href={company.websiteHref}>{company.website}</a></p>
      </section>
    </div>
  );

  const headings = document.blocks.filter((block): block is Paragraph => block.kind === "heading");
  return (
    <div className="page policy-page">
      <div className="policy-toolbar">
        <Link className="text-link" to="/policies"><ArrowLeft size={15} />All policies</Link>
        <button className="button secondary" type="button" onClick={() => window.print()}><Printer size={16} />Print policy</button>
      </div>
      <div className="policy-layout">
        <aside className="policy-navigation">
          <nav aria-label="Policy pages">
            <span className="policy-nav-label">OUR POLICIES</span>
            {policyIndex.map((item) => <NavLink key={item.path} to={item.path}>{item.title}</NavLink>)}
          </nav>
          <details className="policy-contents">
            <summary>On this page</summary>
            <nav aria-label="Sections on this page">{headings.map((heading) => <a key={heading.id} href={`#${heading.id}`}>{heading.text}</a>)}</nav>
          </details>
        </aside>
        <article className="policy-document" aria-labelledby={document.blocks.find((block): block is Paragraph => block.kind === "title")?.id}>
          {document.blocks.map((block, index) => <DocumentBlock key={index} block={block} />)}
          <div className="policy-document-footer">{document.footers.map((block) => <DocumentBlock key={block.id} block={block} />)}</div>
        </article>
      </div>
    </div>
  );
}
