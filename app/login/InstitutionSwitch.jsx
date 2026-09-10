"use client";

import Icon from "@/components/Icon";

/**
 * Choose which institution you are signing in to.
 *
 * The first control on the login page, and the one that decides everything
 * else: which branding the screen wears, which e-mail domain the field
 * suggests, and — the part that matters — which institution's user table
 * the credentials are checked against. A school account cannot sign in to
 * the college and vice versa.
 *
 * Its own component rather than a nested one inside LoginScreen because
 * styled-jsx only scopes a <style jsx> block to JSX written in the same
 * component function. As a nested arrow component its markup never picked
 * up the scoping class, so none of the rules applied and the selected side
 * rendered identically to the unselected one.
 *
 * `tone` picks the palette: "dark" for the brand panel, "light" for the
 * form column on phones where the brand panel is hidden.
 */
export default function InstitutionSwitch({ institutions, active, onPick, tone = "dark" }) {
  return (
    <div
      className={`inst-switch tone-${tone}`}
      role="group"
      aria-label="Choose your institution"
    >
      {institutions.map((i) => {
        const on = i.id === active.id;
        return (
          <button
            key={i.id}
            type="button"
            className={on ? "is-on" : ""}
            onClick={() => onPick(i.id)}
            aria-pressed={on}
          >
            <Icon name={i.id === "college" ? "academic" : "school"} size={15} />
            <span>{i.label}</span>
          </button>
        );
      })}

      <style jsx>{`
        .inst-switch {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px;
          padding: 4px;
          border-radius: 12px;
          min-width: 0;
        }
        button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          /* 44px is the smallest reliable touch target. */
          min-height: 44px;
          min-width: 0;
          padding: 0 12px;
          border: 0;
          border-radius: 9px;
          background: transparent;
          font: inherit;
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          transition: background 120ms ease, color 120ms ease;
        }
        button span {
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* On the brand panel: translucent track, selected side goes solid
           white so it reads as a physical switch against the gradient. */
        .tone-dark {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.16);
        }
        .tone-dark button { color: rgba(255, 255, 255, 0.72); }
        .tone-dark button:hover { color: #fff; background: rgba(255, 255, 255, 0.08); }
        .tone-dark button.is-on { background: #fff; color: var(--brand); }
        .tone-dark button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

        /* In the form column: the institution's own accent carries the
           selected state, which is also the clearest signal that switching
           re-themes the whole page. */
        .tone-light {
          background: var(--bg-2);
          border: 1px solid var(--rule);
        }
        .tone-light button { color: var(--ink-3); }
        .tone-light button:hover { color: var(--ink); background: var(--card); }
        .tone-light button.is-on { background: var(--accent); color: var(--accent-ink); }
        .tone-light button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

        /* Only one of the two is on screen at a time: the brand panel
           disappears below 900px and the form column takes over. */
        .tone-light { display: none; }
        @media (max-width: 900px) {
          .tone-dark { display: none; }
          .tone-light { display: grid; }
        }
        @media (max-width: 380px) {
          button { font-size: 13px; padding: 0 8px; gap: 6px; }
        }
      `}</style>
    </div>
  );
}
