"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

// Brand splash shown the first time a guest lands on the site in a browser
// tab: the logo settles in over a stone ground, then the page fades through.
//
// It is server-rendered so it paints with the very first HTML, before any
// JavaScript runs. Whether it shows at all is decided by the tiny inline
// script below, which runs while the HTML is still parsing: it opens the
// splash (html.splash-open) unless this tab has seen it already
// (sessionStorage). Without JavaScript the class is never added and the
// overlay stays display:none, so it can never stick. Styles live in
// globals.css next to the other guest-site rules.

const STORAGE_KEY = "sama:splash";
const OPEN_CLASS = "splash-open";
/** Measured from navigation start, so a slow hydration does not extend the intro. */
const MIN_VISIBLE_MS = 1600;
const MIN_VISIBLE_REDUCED_MS = 800;
/** Upper bound: a page that is still loading is revealed anyway. */
const MAX_VISIBLE_MS = 4000;
/** Keep in sync with the opacity transition on #g-splash in globals.css. */
const FADE_OUT_MS = 600;

const PRE_HYDRATION_SCRIPT =
  `try{if(!sessionStorage.getItem(${JSON.stringify(STORAGE_KEY)}))` +
  `document.documentElement.classList.add(${JSON.stringify(OPEN_CLASS)})}catch(e){}`;

type Phase = "visible" | "leaving" | "done";

export function SplashScreen() {
  const [phase, setPhase] = useState<Phase>("visible");

  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains(OPEN_CLASS)) {
      setPhase("done");
      return;
    }
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Private mode or storage disabled: the splash simply shows again next time.
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const elapsed = performance.now();
    let minDone = false;
    let pageLoaded = document.readyState === "complete";
    let leaving = false;
    let fadeTimer: number | undefined;

    const leave = () => {
      if (leaving) return;
      leaving = true;
      setPhase("leaving");
      fadeTimer = window.setTimeout(() => {
        root.classList.remove(OPEN_CLASS);
        setPhase("done");
      }, FADE_OUT_MS);
    };
    const maybeLeave = () => {
      if (minDone && pageLoaded) leave();
    };
    const onLoad = () => {
      pageLoaded = true;
      maybeLeave();
    };

    const minTimer = window.setTimeout(() => {
      minDone = true;
      maybeLeave();
    }, Math.max(0, (reduceMotion ? MIN_VISIBLE_REDUCED_MS : MIN_VISIBLE_MS) - elapsed));
    const maxTimer = window.setTimeout(leave, Math.max(0, MAX_VISIBLE_MS - elapsed));
    if (!pageLoaded) window.addEventListener("load", onLoad);

    return () => {
      window.clearTimeout(minTimer);
      window.clearTimeout(maxTimer);
      window.clearTimeout(fadeTimer);
      window.removeEventListener("load", onLoad);
    };
  }, []);

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: PRE_HYDRATION_SCRIPT }} />
      {phase !== "done" && (
        <div id="g-splash" aria-hidden="true" data-leaving={phase === "leaving" ? "" : undefined}>
          <div className="g-splash-logo">
            <Image
              src="/images/brand/logo.png"
              alt=""
              width={792}
              height={742}
              priority
              sizes="(min-width: 640px) 240px, 192px"
              className="h-44 w-auto sm:h-56"
            />
          </div>
          <span className="g-splash-line" />
        </div>
      )}
    </>
  );
}
