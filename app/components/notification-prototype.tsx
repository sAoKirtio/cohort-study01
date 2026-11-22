// Throwaway comparison and the selected combined flow on the course catalog.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router";
import {
  ArrowLeft,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Inbox,
  X,
} from "lucide-react";
import { Sidebar } from "./sidebar";
import { UserRole } from "~/db/schema";
import {
  examples,
  recipients,
  type Recipient,
  type Example,
} from "./notification-prototype-data";
import "./notification-prototype.css";

const variants = ["bell", "center", "combined"] as const;
type Variant = (typeof variants)[number];
const variantNames = {
  bell: "A · 铃铛列表",
  center: "B · 独立通知中心",
  combined: "C · 铃铛和通知中心",
};
const states = {
  normal: "有通知",
  empty: "空列表",
  loading: "加载中",
  error: "加载失败",
};
type FeedState = keyof typeof states;

export function NotificationPrototype({
  variant,
  children,
}: {
  variant: Variant;
  children: ReactNode;
}) {
  const [, setParams] = useSearchParams();
  const [person, setPerson] = useState<Recipient>("emma");
  const [mode, setMode] = useState<FeedState>("normal");
  const [fullList, setFullList] = useState(false);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Example>();
  const [read, setRead] = useState<Set<string>>(new Set());
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const list = useRef<HTMLUListElement>(null);
  const entry = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const items = examples[person];
  const unread =
    mode === "empty" ? 0 : items.filter((item) => !read.has(item.id)).length;
  const loaded = mode === "normal" || mode === "empty";
  const bellEntry = variant !== "center";
  const popover = bellEntry && !(variant === "combined" && fullList);
  const recentPreview = variant === "combined" && popover;
  const visibleItems = recentPreview ? items.slice(0, 2) : items;

  function closeFeed() {
    setOpen(false);
    entry.current?.focus();
  }

  const switchVariant = useCallback(
    (direction: number) => {
      setFullList(false);
      setTarget(undefined);
      setOpen(false);
      setParams(
        (params) => {
          const next =
            (variants.indexOf(variant) + direction + variants.length) %
            variants.length;
          params.set("variant", variants[next]);
          return params;
        },
        { replace: true }
      );
    },
    [variant, setParams]
  );

  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.key === "Escape" && open) closeFeed();
      if (
        !(event.target instanceof HTMLElement) ||
        event.target.closest("input,textarea,select,[contenteditable=true]")
      )
        return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        switchVariant(event.key === "ArrowLeft" ? -1 : 1);
      }
    }
    function outside(event: PointerEvent) {
      if (
        popover &&
        open &&
        event.target instanceof Element &&
        !event.target.closest(".np-panel,.np-entry,.np-tools")
      )
        setOpen(false);
    }
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", outside);
    };
  }, [popover, open, switchVariant]);

  useEffect(() => {
    if (open) panel.current?.focus();
    if (!open || mode !== "normal" || !list.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => (entry.target as HTMLElement).dataset.id!);
        if (visible.length)
          setSeen((previous) => new Set([...previous, ...visible]));
      },
      { threshold: 0.1 }
    );
    for (const row of list.current.children) observer.observe(row);
    return () => observer.disconnect();
  }, [open, mode, person, variant, popover]);

  function markRead(item: Example) {
    setRead((previous) => new Set([...previous, item.id]));
  }
  function openItem(item: Example) {
    if (!item.destination) return;
    markRead(item);
    setOpen(false);
    setTarget(item);
  }

  const entryButton = (
    <button
      ref={entry}
      className={"np-entry " + (bellEntry ? "np-bell" : "np-nav")}
      aria-label={loaded ? "通知，" + unread + " 条未读" : "通知"}
      aria-expanded={open && (!bellEntry || popover)}
      onClick={() => {
        setTarget(undefined);
        setFullList(false);
        setOpen(!(open && (!bellEntry || popover)));
      }}
    >
      <Bell size={19} />
      {!bellEntry && "通知中心"}
      {loaded && unread > 0 && <b>{unread}</b>}
    </button>
  );

  const feed = (
    <section
      className={popover ? "np-panel" : "np-center"}
      aria-label={popover ? "通知列表" : "通知中心"}
      tabIndex={-1}
      ref={panel}
    >
      <header>
        <div>
          <h1>{recentPreview ? "最近通知" : popover ? "通知" : "通知中心"}</h1>
          <small>
            {recipients[person]}
            {loaded && " · " + unread + " 条未读"}
          </small>
        </div>
        <button aria-label="关闭通知" onClick={closeFeed}>
          <X size={18} />
        </button>
      </header>
      {mode === "loading" && (
        <div className="np-status" role="status">
          <span className="animate-pulse">正在加载通知…</span>
        </div>
      )}
      {mode === "empty" && (
        <div className="np-status">
          <Inbox />
          <strong>还没有通知</strong>
          <span>收到新提醒后，会出现在这里。</span>
        </div>
      )}
      {mode === "error" && (
        <div className="np-status" role="alert">
          <strong>通知加载失败</strong>
          <button className="np-action" onClick={() => setMode("normal")}>
            重试
          </button>
        </div>
      )}
      {mode === "normal" && (
        <ul ref={list}>
          {visibleItems.map((item) => {
            const title = (
              <>
                <strong>{item.title}</strong>
                {item.context && <small>{item.context}</small>}
                {item.excerpt && <p>{item.excerpt}</p>}
              </>
            );
            return (
              <li data-id={item.id} key={item.id}>
                <span
                  className={read.has(item.id) ? "np-dot read" : "np-dot"}
                  aria-label={read.has(item.id) ? "已读" : "未读"}
                />
                <div>
                  {item.destination ? (
                    <button className="np-row" onClick={() => openItem(item)}>
                      {title}
                    </button>
                  ) : (
                    title
                  )}
                  <footer>
                    <small>{item.time}</small>
                    {read.has(item.id) ? (
                      <small>已读</small>
                    ) : (
                      <button onClick={() => markRead(item)}>
                        <Check size={13} />
                        标为已读
                      </button>
                    )}
                  </footer>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {recentPreview && (
        <button className="np-view-all" onClick={() => setFullList(true)}>
          查看全部 <ChevronRight size={16} />
        </button>
      )}
    </section>
  );

  const tools = (
    <div className="np-tools" aria-label="原型控制">
      <div className="np-variants">
        <button aria-label="上一方案" onClick={() => switchVariant(-1)}>
          <ChevronLeft size={18} />
        </button>
        <strong>{variantNames[variant]}</strong>
        <button aria-label="下一方案" onClick={() => switchVariant(1)}>
          <ChevronRight size={18} />
        </button>
      </div>
      <label>
        体验身份
        <select
          value={person}
          onChange={(e) => {
            setPerson(e.target.value as Recipient);
            setTarget(undefined);
            setMode("normal");
          }}
        >
          {Object.entries(recipients).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        列表状态
        <select
          value={mode}
          onChange={(e) => {
            setMode(e.target.value as FeedState);
            setOpen(true);
            setTarget(undefined);
          }}
        >
          {Object.entries(states).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <small>
        模拟数据 · 本地演示
        <br />
        {loaded
          ? (mode === "empty"
              ? 0
              : items.filter((item) => seen.has(item.id)).length) +
            " 条已看过 · " +
            unread +
            " 条未读"
          : "等候通知数据"}
      </small>
    </div>
  );

  return (
    <div className="np-host flex h-screen overflow-hidden">
      <Sidebar
        currentUser={{
          id: -1,
          name: recipients[person].split(" · ")[0],
          role: person === "sarah" ? UserRole.Instructor : UserRole.Student,
          avatarUrl: null,
        }}
        isTeamAdmin={person === "marta"}
        brandAction={bellEntry && entryButton}
        navAction={!bellEntry && entryButton}
      />
      <main className="min-w-0 flex-1 overflow-y-auto pb-36">
        {open && !popover ? (
          feed
        ) : target ? (
          <section className="np-detail" key={target.id}>
            <button
              onClick={() => {
                setTarget(undefined);
                setOpen(true);
              }}
            >
              <ArrowLeft size={16} />
              返回通知
            </button>
            <small>{target.destination} · 模拟定位</small>
            <h1>{target.context}</h1>
            <article>
              <strong>{target.title}</strong>
              <p>{target.detail ?? target.excerpt}</p>
            </article>
          </section>
        ) : (
          children
        )}
      </main>
      {open && popover && feed}
      {tools}
    </div>
  );
}
