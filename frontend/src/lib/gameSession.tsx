import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, post, readLocal, writeLocal, useAuth } from "./api";
export function useGameSession(slug: string, mode: string, level: number) {
  const { user, refresh } = useAuth();
  const game = useQuery({
    queryKey: ["game-access", slug, mode, user?.id],
    queryFn: () => api(`/games/${slug}?mode=${mode}`),
  });
  const cacheKey = `lexi-attempt:${user?.id}:${slug}:${mode}`;
  const [record, setRecord] = useState<any>(null),
    [elapsed, setElapsed] = useState(0),
    [recoveryError, setRecoveryError] = useState("");
  const clock = useRef({ elapsed: 0, at: performance.now() });
  function receive(r: any) {
    const age = Math.max(
      0,
      (Date.parse(r.serverTime) - Date.parse(r.startedAt)) / 1000,
    );
    clock.current = { elapsed: age, at: performance.now() };
    setElapsed(Math.floor(age));
    setRecord(r);
    return r;
  }
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const saved = readLocal<any>(cacheKey, null);
    if (saved?.id)
      api(`/games/${slug}/sessions/${saved.id}`)
        .then((r) => {
          if (alive) receive(r);
        })
        .catch((e) => {
          if (alive) setRecoveryError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [cacheKey, slug, user?.id]);
  useEffect(() => {
    if (
      !record?.id ||
      !["ACTIVE", "TRIAL_ACTIVE", "PAYMENT_AUTHORIZED"].includes(
        record.billingState,
      )
    )
      return;
    let alive = true;
    const tick = setInterval(
      () =>
        setElapsed(
          Math.floor(
            clock.current.elapsed +
              (performance.now() - clock.current.at) / 1000,
          ),
        ),
      250,
    );
    const sync = () =>
      api(`/games/${slug}/sessions/${record.id}`)
        .then((r) => {
          if (alive) receive(r);
        })
        .catch(() => {});
    const poll = setInterval(sync, 5000);
    document.addEventListener("visibilitychange", sync);
    return () => {
      alive = false;
      clearInterval(tick);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [record?.id, record?.billingState, slug]);
  async function activate(r: any) {
    if (["CREATED", "PAYMENT_AUTHORIZED"].includes(r.billingState))
      r = await post(`/games/${slug}/sessions/${r.id}/ready`);
    return receive(r);
  }
  async function purchase(r = record) {
    const authorized = await post(`/games/${slug}/sessions/${r.id}/authorize`, {
      confirmedPrice: r.coinPrice,
      pricingVersion: r.pricingVersion,
    });
    receive(authorized); // Preserve the refundable state even if the ready request loses its response.
    await refresh();
    writeLocal(cacheKey, { id: r.id, actions: [] });
    return activate(authorized);
  }
  async function start(intent: "preview" | "full", agreedPrice = 0) {
    const pendingKey = `${cacheKey}:request:${level}:${intent}`;
    const requestId =
      readLocal<string | null>(pendingKey, null) || crypto.randomUUID();
    writeLocal(pendingKey, requestId);
    const r = await post(`/games/${slug}/sessions`, {
      difficulty: mode,
      level,
      requestId,
      intent,
    });
    writeLocal(pendingKey, null);
    const saved = readLocal<any>(cacheKey, null);
    writeLocal(cacheKey, {
      id: r.id,
      actions: saved?.id === r.id ? saved.actions : [],
    });
    receive(r);
    if (r.billingState === "PAYMENT_REQUIRED") {
      if (r.coinPrice !== agreedPrice)
        throw new Error(
          "The session price changed. Review the new price before confirming.",
        );
      return purchase(r);
    }
    return activate(r);
  }
  async function cancel() {
    if (record?.id)
      receive(await post(`/games/${slug}/sessions/${record.id}/cancel`));
    writeLocal(cacheKey, null);
    await refresh();
  }
  const billingState =
    record?.billingState === "TRIAL_ACTIVE" && elapsed >= record.trialSeconds
      ? "TRIAL_EXPIRED"
      : record?.billingState;
  return {
    game,
    record,
    elapsed,
    billingState,
    cacheKey,
    recoveryError,
    start,
    purchase,
    cancel,
    resume: () => activate(record),
    preview:
      record?.trialSeconds > 0 &&
      !["PAYMENT_AUTHORIZED", "ACTIVE"].includes(record?.billingState),
    blocked:
      !!record &&
      [
        "TRIAL_EXPIRED",
        "PAYMENT_REQUIRED",
        "PAYMENT_AUTHORIZED",
        "CREATED",
        "EXPIRED",
        "REFUNDED",
        "ABANDONED",
      ].includes(billingState),
  };
}
