"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_MEMORY_PRUNING_POLICY,
  isTileId,
  isVillagerActionType,
  listVillagers,
  type MemoryId,
  type NpcState,
  type ShortTermVillagerMemory,
  VILLAGE_MAP_DIMENSIONS,
  VILLAGE_MAP_SEED,
  type Tile,
  type Villager,
  type VillagerId,
  type VillagerMemoryStore,
} from "@/domain";
import { env } from "@/config/env";
import {
  advanceVillagerActionExecution,
  advanceVillagerAnimationState,
  advanceVillagerMovement,
  applyNpcIntentToTask,
  applyActionResourceEffects,
  assembleNpcPromptInput,
  beginVillagerActionExecution,
  buildVillagerDailyScheduleIndex,
  createInitialResourceInventory,
  createNpcPromptSignature,
  createVillagerAnimationState,
  createPathfindingService,
  createVillagerMovementComponent,
  createVillagerTaskSignature,
  getVillagerActionIndicator,
  planVillagerMovementIntent,
  resolveActiveVillagerTask,
  shouldRequestNpcReplan,
  shouldStartVillagerActionExecution,
  toSimulationTime,
  parseWorldSnapshot,
  type NpcReplanState,
  type VillagerActionExecution,
  type VillagerAnimationState,
  type VillagerMovementComponent,
  WORLD_SNAPSHOT_VERSION,
} from "@/simulation";

const simulationControls = [
  { id: "pause", label: "Pause simulation" },
  { id: "play", label: "Play simulation" },
  { id: "slower", label: "Decrease simulation speed" },
  { id: "faster", label: "Increase simulation speed" },
  { id: "resetDay", label: "Reset day" },
] as const;

const cameraControls = [
  { id: "up", label: "Pan camera up", delta: { x: 0, y: -1 } },
  { id: "down", label: "Pan camera down", delta: { x: 0, y: 1 } },
  { id: "left", label: "Pan camera left", delta: { x: -1, y: 0 } },
  { id: "right", label: "Pan camera right", delta: { x: 1, y: 0 } },
] as const;

const VIEWPORT_TILE_SIZE = 56;
const VIEWPORT_TILE_WIDTH = 8;
const VIEWPORT_TILE_HEIGHT = 6;
const BASE_TICK_INTERVAL_MS = 500;
const DAY_LENGTH_TICKS = 240;
const NPC_REPLAN_INTERVAL_TICKS = env.NEXT_PUBLIC_NPC_REPLAN_INTERVAL_TICKS;
const NPC_MAX_REPLANS_PER_TICK = env.NEXT_PUBLIC_NPC_MAX_REPLANS_PER_TICK;
const SIMULATION_SPEED_LEVELS = [0.5, 1, 2, 4] as const;
const TILE_LAYER_ORDER: readonly Tile["type"][] = [
  "water",
  "path",
  "farm",
  "plaza",
  "home",
  "shop",
  "tree",
];
const TILE_VISUAL_TOKENS: Record<Tile["type"], string> = {
  water: "~~",
  path: "·",
  farm: "ff",
  plaza: "pp",
  home: "hh",
  shop: "$$",
  tree: "tt",
};
const INTERACTION_MAX_DISTANCE = 1;
const INTERACTION_COOLDOWN_TICKS = 8;
const INTERACTION_MEMORY_EXPIRATION_TICKS = 360;
const SNAPSHOT_PERSIST_INTERVAL_TICKS = 5;
const JOURNAL_MAX_EVENTS = 120;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toViewportCoordinate(tile: Tile, cameraX: number, cameraY: number) {
  return {
    x: tile.coordinate.x - cameraX,
    y: tile.coordinate.y - cameraY,
  };
}

function parseTileIdCoordinate(tileId: string) {
  const [, x = "0", y = "0"] = tileId.split("_");
  return { x: Number.parseInt(x, 10), y: Number.parseInt(y, 10) };
}

function isNpcInteractionEligible(npcState: NpcState): boolean {
  return npcState !== "moving";
}

function toVillagerPairKey(firstVillagerId: VillagerId, secondVillagerId: VillagerId): string {
  return [firstVillagerId, secondVillagerId].sort().join("|");
}

function buildMemoryId(villagerId: VillagerId, tick: number, eventId: string): MemoryId {
  return `memory_${villagerId}_${tick}_${eventId}` as MemoryId;
}

function formatMinuteOfDay(minuteOfDay: number): string {
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

interface NpcInteractionEvent {
  id: string;
  tick: number;
  tileId: Tile["id"];
  participants: readonly [VillagerId, VillagerId];
}

type SimulationEventType = "movement_arrival" | "interaction" | "ai_decision" | "policy_violation";

interface SimulationJournalEvent {
  id: string;
  tick: number;
  day: number;
  minuteOfDay: number;
  type: SimulationEventType;
  villagerIds: readonly VillagerId[];
  summary: string;
}

interface VillagerRuntimeState {
  villager: Villager;
  movement: VillagerMovementComponent;
  targetTileId: Tile["id"];
  npcState: NpcState;
  actionExecution?: VillagerActionExecution;
  animation: VillagerAnimationState;
  replan: NpcReplanState;
  memoryStore: VillagerMemoryStore;
}

interface ApiNpcDecision {
  action: Villager["currentAction"];
  reasoning: string;
  targetTileId?: Tile["id"];
}

interface ApiNpcDecisionObservability {
  provider: "mock" | "openai" | "anthropic";
  latencyMs: number;
  tokenUsage: {
    requestTokens: number;
    responseTokens: number;
    totalTokens: number;
  };
  decisionValidity: "accepted" | "rewritten";
  policyViolations: readonly {
    policyId: string;
    reason: string;
    originalAction: Villager["currentAction"];
    finalAction: Villager["currentAction"];
    outcome: "rewrite" | "block";
  }[];
}

interface NpcObservabilityAggregate {
  requestCount: number;
  validDecisionCount: number;
  rewrittenDecisionCount: number;
  policyViolationCount: number;
  failedRequestCount: number;
  totalLatencyMs: number;
  requestTokens: number;
  responseTokens: number;
  totalTokens: number;
}

function createEmptyMemoryStore(villagerId: VillagerId): VillagerMemoryStore {
  return {
    villagerId,
    shortTerm: [],
    longTerm: [],
  };
}

function createInitialVillagerRuntime(villagers: readonly Villager[]): VillagerRuntimeState[] {
  return villagers.map((villager) => ({
    villager,
    movement: createVillagerMovementComponent(villager.id, villager.spawnTileId),
    targetTileId: villager.spawnTileId,
    npcState: "planning",
    animation: createVillagerAnimationState(),
    replan: {},
    memoryStore: createEmptyMemoryStore(villager.id),
  }));
}

function createWorldSnapshot(
  tick: number,
  day: number,
  minuteOfDay: number,
  runtime: readonly VillagerRuntimeState[],
) {
  return {
    version: WORLD_SNAPSHOT_VERSION,
    savedAtIso: new Date().toISOString(),
    world: {
      tick,
      day,
      minuteOfDay,
    },
    npcs: runtime.map((entry) => ({
      villagerId: entry.villager.id,
      currentTileId: entry.movement.currentTileId,
      targetTileId: entry.targetTileId,
      npcState: entry.npcState,
      memoryStore: entry.memoryStore,
      replan: entry.replan,
    })),
  };
}

function isApiNpcDecision(value: unknown): value is ApiNpcDecision {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { action?: unknown; reasoning?: unknown; targetTileId?: unknown };
  if (
    typeof candidate.reasoning !== "string" ||
    typeof candidate.action !== "string" ||
    !isVillagerActionType(candidate.action)
  ) {
    return false;
  }

  return (
    candidate.targetTileId === undefined ||
    (typeof candidate.targetTileId === "string" && isTileId(candidate.targetTileId))
  );
}

function isApiNpcDecisionObservability(value: unknown): value is ApiNpcDecisionObservability {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    provider?: unknown;
    latencyMs?: unknown;
    tokenUsage?: unknown;
    decisionValidity?: unknown;
    policyViolations?: unknown;
  };
  if (
    (candidate.provider !== "mock" && candidate.provider !== "openai" && candidate.provider !== "anthropic") ||
    typeof candidate.latencyMs !== "number" ||
    !Number.isFinite(candidate.latencyMs) ||
    candidate.latencyMs < 0 ||
    (candidate.decisionValidity !== "accepted" && candidate.decisionValidity !== "rewritten")
  ) {
    return false;
  }

  const tokenUsage = candidate.tokenUsage;
  if (!tokenUsage || typeof tokenUsage !== "object") {
    return false;
  }

  const usage = tokenUsage as {
    requestTokens?: unknown;
    responseTokens?: unknown;
    totalTokens?: unknown;
  };
  if (
    typeof usage.requestTokens === "number" &&
    usage.requestTokens >= 0 &&
    typeof usage.responseTokens === "number" &&
    usage.responseTokens >= 0 &&
    typeof usage.totalTokens === "number" &&
    usage.totalTokens >= 0
  ) {
    const policyViolations = candidate.policyViolations;
    return (
      Array.isArray(policyViolations) &&
      policyViolations.every((entry) => {
        if (!entry || typeof entry !== "object") {
          return false;
        }
        const violation = entry as {
          policyId?: unknown;
          reason?: unknown;
          originalAction?: unknown;
          finalAction?: unknown;
          outcome?: unknown;
        };
        return (
          typeof violation.policyId === "string" &&
          violation.policyId.length > 0 &&
          typeof violation.reason === "string" &&
          violation.reason.length > 0 &&
          typeof violation.originalAction === "string" &&
          isVillagerActionType(violation.originalAction) &&
          typeof violation.finalAction === "string" &&
          isVillagerActionType(violation.finalAction) &&
          (violation.outcome === "rewrite" || violation.outcome === "block")
        );
      })
    );
  }

  return false;
}

export default function GamePage() {
  const maxCameraX = Math.max(0, VILLAGE_MAP_DIMENSIONS.width - VIEWPORT_TILE_WIDTH);
  const maxCameraY = Math.max(0, VILLAGE_MAP_DIMENSIONS.height - VIEWPORT_TILE_HEIGHT);
  const inflightReplansRef = useRef(new Set<VillagerId>());
  const interactionCooldownRef = useRef(new Map<string, number>());
  const completedActionTickRef = useRef(new Map<VillagerId, number>());
  const hydrationFinishedRef = useRef(false);
  const latestPersistedTickRef = useRef<number | undefined>(undefined);
  const journalEventsRef = useRef<SimulationJournalEvent[]>([]);
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(1);
  const villagers = useMemo(() => listVillagers(), []);
  const [selectedVillagerId, setSelectedVillagerId] = useState<VillagerId | undefined>(villagers[0]?.id);
  const [eventTypeFilter, setEventTypeFilter] = useState<SimulationEventType | "all">("all");
  const [eventVillagerFilter, setEventVillagerFilter] = useState<VillagerId | "all">("all");
  const [resourceInventory, setResourceInventory] = useState(() => createInitialResourceInventory());
  const [npcObservabilityByVillager, setNpcObservabilityByVillager] = useState<
    Map<VillagerId, NpcObservabilityAggregate>
  >(new Map());
  const scheduleIndex = useMemo(() => buildVillagerDailyScheduleIndex(villagers), [villagers]);
  const pathfinding = useMemo(() => createPathfindingService(VILLAGE_MAP_SEED), []);
  const [villagerRuntime, setVillagerRuntime] = useState<VillagerRuntimeState[]>(() =>
    createInitialVillagerRuntime(villagers),
  );

  const simulationSpeed = SIMULATION_SPEED_LEVELS[speedIndex] ?? SIMULATION_SPEED_LEVELS[1];

  const pauseSimulation = useCallback(() => {
    setPaused(true);
  }, []);

  const playSimulation = useCallback(() => {
    setPaused(false);
  }, []);

  const increaseSimulationSpeed = useCallback(() => {
    setSpeedIndex((current) => Math.min(current + 1, SIMULATION_SPEED_LEVELS.length - 1));
  }, []);

  const decreaseSimulationSpeed = useCallback(() => {
    setSpeedIndex((current) => Math.max(current - 1, 0));
  }, []);

  const resetDay = useCallback(() => {
    setTick(0);
    completedActionTickRef.current = new Map();
    setResourceInventory(createInitialResourceInventory());
  }, []);

  const moveCamera = useCallback(
    (deltaX: number, deltaY: number) => {
      setCamera((current) => ({
        x: clamp(current.x + deltaX, 0, maxCameraX),
        y: clamp(current.y + deltaY, 0, maxCameraY),
      }));
    },
    [maxCameraX, maxCameraY],
  );

  const appendJournalEvents = useCallback((events: readonly SimulationJournalEvent[]) => {
    if (events.length === 0) {
      return;
    }
    journalEventsRef.current = [...events, ...journalEventsRef.current]
      .sort((left, right) => right.tick - left.tick)
      .slice(0, JOURNAL_MAX_EVENTS);
  }, []);

  const recordNpcObservability = useCallback(
    (villagerId: VillagerId, update: Partial<NpcObservabilityAggregate>) => {
      setNpcObservabilityByVillager((current) => {
        const next = new Map(current);
        const previous = next.get(villagerId) ?? {
          requestCount: 0,
          validDecisionCount: 0,
          rewrittenDecisionCount: 0,
          policyViolationCount: 0,
          failedRequestCount: 0,
          totalLatencyMs: 0,
          requestTokens: 0,
          responseTokens: 0,
          totalTokens: 0,
        };
        next.set(villagerId, {
          requestCount: previous.requestCount + (update.requestCount ?? 0),
          validDecisionCount: previous.validDecisionCount + (update.validDecisionCount ?? 0),
          rewrittenDecisionCount: previous.rewrittenDecisionCount + (update.rewrittenDecisionCount ?? 0),
          policyViolationCount: previous.policyViolationCount + (update.policyViolationCount ?? 0),
          failedRequestCount: previous.failedRequestCount + (update.failedRequestCount ?? 0),
          totalLatencyMs: previous.totalLatencyMs + (update.totalLatencyMs ?? 0),
          requestTokens: previous.requestTokens + (update.requestTokens ?? 0),
          responseTokens: previous.responseTokens + (update.responseTokens ?? 0),
          totalTokens: previous.totalTokens + (update.totalTokens ?? 0),
        });
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    if (paused) {
      return;
    }
    const timer = window.setInterval(() => {
      setTick((current) => current + 1);
    }, BASE_TICK_INTERVAL_MS / simulationSpeed);

    return () => {
      window.clearInterval(timer);
    };
  }, [paused, simulationSpeed]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/simulation-snapshot")
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { snapshot?: unknown; error?: unknown } | null;
        if (!response.ok) {
          const errorMessage =
            payload && typeof payload.error === "string"
              ? payload.error
              : `Snapshot restore failed with status ${response.status}`;
          throw new Error(errorMessage);
        }
        return parseWorldSnapshot(payload?.snapshot);
      })
      .then((snapshot) => {
        if (cancelled || !snapshot) {
          return;
        }

        setTick(snapshot.world.tick);
        setVillagerRuntime(() => {
          const initialRuntime = createInitialVillagerRuntime(villagers);
          const snapshotByVillager = new Map(snapshot.npcs.map((entry) => [entry.villagerId, entry]));
          return initialRuntime.map((runtime) => {
            const persisted = snapshotByVillager.get(runtime.villager.id);
            if (!persisted) {
              return runtime;
            }

            return {
              ...runtime,
              movement: createVillagerMovementComponent(runtime.villager.id, persisted.currentTileId),
              targetTileId: persisted.targetTileId,
              npcState: persisted.npcState,
              replan: persisted.replan,
              memoryStore: persisted.memoryStore,
            };
          });
        });
      })
      .catch((error) => {
        console.error("[simulation] Snapshot restore failed", error);
      })
      .finally(() => {
        if (!cancelled) {
          hydrationFinishedRef.current = true;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [villagers]);

  useEffect(() => {
    const simulationTime = toSimulationTime(tick, DAY_LENGTH_TICKS);
    setVillagerRuntime((current) => {
      const journalEvents: SimulationJournalEvent[] = [];
      const advancedRuntime = current.map((runtime) => {
        const schedule = scheduleIndex.get(runtime.villager.id);
        if (!schedule) {
          throw new Error(`missing schedule for villager ${runtime.villager.id}`);
        }

        const activeTask = resolveActiveVillagerTask(schedule, simulationTime);
        const plannedTask = applyNpcIntentToTask(activeTask, runtime.replan.intent);
        const planningResult = planVillagerMovementIntent({
          villager: runtime.villager,
          movement: runtime.movement,
          activeTask: plannedTask,
          pathfinding,
          tick,
          previousTargetTileId: runtime.targetTileId,
        });
        const movementResult = advanceVillagerMovement(planningResult.movement, tick);
        const taskSignature = createVillagerTaskSignature(plannedTask);
        let actionExecution =
          runtime.actionExecution?.taskSignature === taskSignature ? runtime.actionExecution : undefined;
        let npcState = planningResult.npcState;

        if (planningResult.npcState === "acting") {
          if (shouldStartVillagerActionExecution(actionExecution, taskSignature)) {
            actionExecution = beginVillagerActionExecution(activeTask, tick, taskSignature);
          }

          if (actionExecution) {
            const actionProgress = advanceVillagerActionExecution(actionExecution, tick);
            actionExecution = actionProgress.execution;
            npcState = actionProgress.npcState;
          }
        } else {
          actionExecution = undefined;
        }

        const animation = advanceVillagerAnimationState(runtime.animation, {
          previousTileId: runtime.movement.currentTileId,
          currentTileId: movementResult.component.currentTileId,
          npcState,
          action: actionExecution?.action ?? plannedTask.action,
          tick,
        });

        if (movementResult.events.length > 0) {
          journalEvents.push(
            ...movementResult.events.map((event) => ({
              id: `${event.type}_${event.villagerId}_${event.tick}_${event.tileId}`,
              tick: event.tick,
              day: simulationTime.day,
              minuteOfDay: simulationTime.minuteOfDay,
              type: "movement_arrival" as const,
              villagerIds: [event.villagerId],
              summary: `${runtime.villager.name} arrived at ${event.tileId}.`,
            })),
          );
        }

        return {
          ...runtime,
          movement: movementResult.component,
          targetTileId: planningResult.targetTileId,
          npcState,
          actionExecution,
          animation,
          replan: {
            ...runtime.replan,
            lastMajorEventTick:
              movementResult.events.length > 0
                ? movementResult.events[movementResult.events.length - 1].tick
                : runtime.replan.lastMajorEventTick,
          },
        };
      });

      const interactions: NpcInteractionEvent[] = [];
      const nextInteractionCooldown = new Map(interactionCooldownRef.current);
      for (let index = 0; index < advancedRuntime.length; index += 1) {
        const left = advancedRuntime[index];
        if (!left || !isNpcInteractionEligible(left.npcState)) {
          continue;
        }

        const leftCoordinate = parseTileIdCoordinate(left.movement.currentTileId);
        for (let innerIndex = index + 1; innerIndex < advancedRuntime.length; innerIndex += 1) {
          const right = advancedRuntime[innerIndex];
          if (!right || !isNpcInteractionEligible(right.npcState)) {
            continue;
          }

          const rightCoordinate = parseTileIdCoordinate(right.movement.currentTileId);
          const manhattanDistance =
            Math.abs(leftCoordinate.x - rightCoordinate.x) + Math.abs(leftCoordinate.y - rightCoordinate.y);
          if (manhattanDistance > INTERACTION_MAX_DISTANCE) {
            continue;
          }

          const pairKey = toVillagerPairKey(left.villager.id, right.villager.id);
          const lastInteractionTick = nextInteractionCooldown.get(pairKey);
          if (lastInteractionTick !== undefined && tick - lastInteractionTick < INTERACTION_COOLDOWN_TICKS) {
            continue;
          }

          nextInteractionCooldown.set(pairKey, tick);
          interactions.push({
            id: `interaction_${tick}_${pairKey}`,
            tick,
            tileId: left.movement.currentTileId,
            participants: [left.villager.id, right.villager.id],
          });
        }
      }
      interactionCooldownRef.current = nextInteractionCooldown;
      const villagerById = new Map(advancedRuntime.map((entry) => [entry.villager.id, entry.villager] as const));

      journalEvents.push(
        ...interactions.map((interaction) => {
          const [firstVillagerId, secondVillagerId] = interaction.participants;
          const firstName = villagerById.get(firstVillagerId)?.name ?? firstVillagerId;
          const secondName = villagerById.get(secondVillagerId)?.name ?? secondVillagerId;
          return {
            id: interaction.id,
            tick: interaction.tick,
            day: simulationTime.day,
            minuteOfDay: simulationTime.minuteOfDay,
            type: "interaction" as const,
            villagerIds: [firstVillagerId, secondVillagerId],
            summary: `${firstName} and ${secondName} interacted near ${interaction.tileId}.`,
          };
        }),
      );

      if (interactions.length === 0) {
        appendJournalEvents(journalEvents);
        return advancedRuntime;
      }

      const eventsByParticipant = new Map<VillagerId, NpcInteractionEvent[]>();
      for (const interaction of interactions) {
        const [firstVillagerId, secondVillagerId] = interaction.participants;
        const firstEvents = eventsByParticipant.get(firstVillagerId) ?? [];
        firstEvents.push(interaction);
        eventsByParticipant.set(firstVillagerId, firstEvents);
        const secondEvents = eventsByParticipant.get(secondVillagerId) ?? [];
        secondEvents.push(interaction);
        eventsByParticipant.set(secondVillagerId, secondEvents);
      }

      const nextRuntime = advancedRuntime.map((runtime) => {
        const participantEvents = eventsByParticipant.get(runtime.villager.id);
        if (!participantEvents || participantEvents.length === 0) {
          return runtime;
        }

        const interactionMemories: ShortTermVillagerMemory[] = participantEvents.map((event) => {
          const [firstVillagerId, secondVillagerId] = event.participants;
          const otherVillagerId = runtime.villager.id === firstVillagerId ? secondVillagerId : firstVillagerId;
          const otherVillager = villagerById.get(otherVillagerId);
          return {
            id: buildMemoryId(runtime.villager.id, event.tick, event.id),
            villagerId: runtime.villager.id,
            type: "interaction",
            summary: `Interacted with ${otherVillager?.name ?? "another villager"} near ${event.tileId}.`,
            source: {
              type: "villager",
              actorVillagerId: otherVillagerId,
              eventId: event.id,
            },
            createdAt: simulationTime,
            importance: 0.55,
            bucket: "short_term",
            expiresAfterTicks: INTERACTION_MEMORY_EXPIRATION_TICKS,
          };
        });
        const nextShortTerm = [...runtime.memoryStore.shortTerm, ...interactionMemories].slice(
          -DEFAULT_MEMORY_PRUNING_POLICY.shortTermMaxEntries,
        );
        const latestEventTick = participantEvents[participantEvents.length - 1]?.tick;

        return {
          ...runtime,
          memoryStore: {
            ...runtime.memoryStore,
            shortTerm: nextShortTerm,
          },
          replan: {
            ...runtime.replan,
            lastMajorEventTick:
              latestEventTick !== undefined
                ? Math.max(runtime.replan.lastMajorEventTick ?? 0, latestEventTick)
                : runtime.replan.lastMajorEventTick,
          },
        };
      });

      appendJournalEvents(journalEvents);
      return nextRuntime;
    });
  }, [appendJournalEvents, pathfinding, scheduleIndex, tick]);

  useEffect(() => {
    const completedActions: Villager["currentAction"][] = [];
    const nextCompletedActionTick = new Map(completedActionTickRef.current);

    for (const runtime of villagerRuntime) {
      const actionExecution = runtime.actionExecution;
      const completedAtTick = actionExecution?.completedAtTick;
      if (!actionExecution || completedAtTick === undefined) {
        continue;
      }

      const previousCompletedTick = nextCompletedActionTick.get(runtime.villager.id);
      if (previousCompletedTick === completedAtTick) {
        continue;
      }

      if (previousCompletedTick !== undefined && completedAtTick < previousCompletedTick) {
        continue;
      }

      completedActions.push(actionExecution.action);
      nextCompletedActionTick.set(runtime.villager.id, completedAtTick);
    }

    completedActionTickRef.current = nextCompletedActionTick;
    if (completedActions.length === 0) {
      return;
    }

    setResourceInventory((current) => applyActionResourceEffects(current, completedActions));
  }, [villagerRuntime]);

  useEffect(() => {
    const simulationTime = toSimulationTime(tick, DAY_LENGTH_TICKS);
    let replansRequestedThisTick = 0;
    for (const runtime of villagerRuntime) {
      if (replansRequestedThisTick >= NPC_MAX_REPLANS_PER_TICK) {
        break;
      }
      if (inflightReplansRef.current.has(runtime.villager.id)) {
        continue;
      }

      const schedule = scheduleIndex.get(runtime.villager.id);
      if (!schedule) {
        throw new Error(`missing schedule for villager ${runtime.villager.id}`);
      }

      const activeTask = resolveActiveVillagerTask(schedule, simulationTime);
      const plannedTask = applyNpcIntentToTask(activeTask, runtime.replan.intent);
      const promptInput = assembleNpcPromptInput({
        villager: runtime.villager,
        activeTask: plannedTask,
        memoryStore: runtime.memoryStore,
        currentTileId: runtime.movement.currentTileId,
        targetTileId: runtime.targetTileId,
        time: simulationTime,
      });
      const promptSignature = createNpcPromptSignature(promptInput);
      const replanReason = shouldRequestNpcReplan({
        tick,
        intervalTicks: NPC_REPLAN_INTERVAL_TICKS,
        promptSignature,
        lastPlanTick: runtime.replan.lastPlanTick,
        lastPlanSignature: runtime.replan.lastPlanSignature,
        lastMajorEventTick: runtime.replan.lastMajorEventTick,
      });

      if (!replanReason) {
        continue;
      }

      inflightReplansRef.current.add(runtime.villager.id);
      replansRequestedThisTick += 1;
      const requestStartedAt = performance.now();
      void fetch("/api/npc-decision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ context: promptInput }),
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as {
            decision?: unknown;
            observability?: unknown;
            error?: unknown;
          } | null;
          if (!response.ok) {
            const errorMessage =
              payload && typeof payload.error === "string"
                ? payload.error
                : `Replan request failed with status ${response.status}`;
            throw new Error(errorMessage);
          }
          if (!payload || !isApiNpcDecision(payload.decision)) {
            throw new Error("Replan API returned invalid decision payload");
          }
          if (!isApiNpcDecisionObservability(payload.observability)) {
            throw new Error("Replan API returned invalid observability payload");
          }
          const decision = payload.decision;
          const observability = payload.observability;

          recordNpcObservability(runtime.villager.id, {
            requestCount: 1,
            validDecisionCount: observability.decisionValidity === "accepted" ? 1 : 0,
            rewrittenDecisionCount: observability.decisionValidity === "rewritten" ? 1 : 0,
            policyViolationCount: observability.policyViolations.length,
            totalLatencyMs: observability.latencyMs,
            requestTokens: observability.tokenUsage.requestTokens,
            responseTokens: observability.tokenUsage.responseTokens,
            totalTokens: observability.tokenUsage.totalTokens,
          });

          setVillagerRuntime((current) =>
            current.map((entry) =>
              entry.villager.id === runtime.villager.id
                ? {
                    ...entry,
                    replan: {
                      ...entry.replan,
                      intent: {
                        action: decision.action,
                        targetTileId: decision.targetTileId,
                        reasoning: decision.reasoning,
                        plannedAtTick: tick,
                      },
                      intentUpdatedAtTick: tick,
                      lastPlanTick: tick,
                      lastPlanSignature: promptSignature,
                    },
                  }
                : entry,
            ),
          );
          appendJournalEvents([
            {
              id: `decision_${runtime.villager.id}_${tick}`,
              tick,
              day: simulationTime.day,
              minuteOfDay: simulationTime.minuteOfDay,
              type: "ai_decision",
              villagerIds: [runtime.villager.id],
              summary: `${runtime.villager.name} planned ${decision.action}${decision.targetTileId ? ` to ${decision.targetTileId}` : ""}.`,
            },
            ...observability.policyViolations.map((violation, index) => ({
              id: `policy_${runtime.villager.id}_${tick}_${violation.policyId}_${index}`,
              tick,
              day: simulationTime.day,
              minuteOfDay: simulationTime.minuteOfDay,
              type: "policy_violation" as const,
              villagerIds: [runtime.villager.id] as const,
              summary: `${runtime.villager.name} policy ${violation.policyId}: ${violation.originalAction} -> ${violation.finalAction}.`,
            })),
          ]);
        })
        .catch((error) => {
          recordNpcObservability(runtime.villager.id, {
            requestCount: 1,
            failedRequestCount: 1,
            totalLatencyMs: Math.max(1, Math.round(performance.now() - requestStartedAt)),
          });
          console.error("[simulation] NPC re-planning failed", {
            villagerId: runtime.villager.id,
            reason: replanReason,
            error,
          });
          setVillagerRuntime((current) =>
            current.map((entry) =>
              entry.villager.id === runtime.villager.id
                ? {
                    ...entry,
                    replan: {
                      ...entry.replan,
                      lastPlanTick: tick,
                      lastPlanSignature: promptSignature,
                    },
                  }
                : entry,
            ),
          );
        })
        .finally(() => {
          inflightReplansRef.current.delete(runtime.villager.id);
        });
    }
  }, [appendJournalEvents, recordNpcObservability, scheduleIndex, tick, villagerRuntime]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveCamera(0, -1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        moveCamera(0, 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveCamera(-1, 0);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        moveCamera(1, 0);
      } else if (event.key === " ") {
        event.preventDefault();
        setPaused((current) => !current);
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        increaseSimulationSpeed();
      } else if (event.key === "-") {
        event.preventDefault();
        decreaseSimulationSpeed();
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        resetDay();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [decreaseSimulationSpeed, increaseSimulationSpeed, moveCamera, resetDay]);

  const visibleTiles = useMemo(() => {
    const layerPriority = new Map(TILE_LAYER_ORDER.map((type, index) => [type, index]));
    return VILLAGE_MAP_SEED
      .map((tile) => {
        const viewport = toViewportCoordinate(tile, camera.x, camera.y);
        return { tile, viewport };
      })
      .filter(
        ({ viewport }) =>
          viewport.x >= 0 &&
          viewport.x < VIEWPORT_TILE_WIDTH &&
          viewport.y >= 0 &&
          viewport.y < VIEWPORT_TILE_HEIGHT,
      )
      .sort((a, b) => {
        const layerDifference =
          (layerPriority.get(a.tile.type) ?? TILE_LAYER_ORDER.length) -
          (layerPriority.get(b.tile.type) ?? TILE_LAYER_ORDER.length);
        if (layerDifference !== 0) return layerDifference;
        if (a.tile.coordinate.y !== b.tile.coordinate.y) {
          return a.tile.coordinate.y - b.tile.coordinate.y;
        }
        return a.tile.coordinate.x - b.tile.coordinate.x;
      });
  }, [camera.x, camera.y]);

  const visibleVillagers = useMemo(
    () =>
      villagerRuntime
        .map((runtime) => {
          const coordinate = parseTileIdCoordinate(runtime.movement.currentTileId);
          return {
            runtime,
            viewport: {
              x: coordinate.x - camera.x,
              y: coordinate.y - camera.y,
            },
          };
        })
        .filter(
          ({ viewport }) =>
            viewport.x >= 0 &&
            viewport.x < VIEWPORT_TILE_WIDTH &&
            viewport.y >= 0 &&
            viewport.y < VIEWPORT_TILE_HEIGHT,
        ),
    [camera.x, camera.y, villagerRuntime],
  );
  const simulationTime = useMemo(() => toSimulationTime(tick, DAY_LENGTH_TICKS), [tick]);
  const formattedTime = useMemo(() => formatMinuteOfDay(simulationTime.minuteOfDay), [simulationTime.minuteOfDay]);
  const selectedVillagerRuntime = useMemo(
    () => villagerRuntime.find((runtime) => runtime.villager.id === selectedVillagerId),
    [selectedVillagerId, villagerRuntime],
  );
  const selectedVillagerTask = useMemo(() => {
    if (!selectedVillagerRuntime) {
      return undefined;
    }
    const schedule = scheduleIndex.get(selectedVillagerRuntime.villager.id);
    if (!schedule) {
      return undefined;
    }
    const activeTask = resolveActiveVillagerTask(schedule, simulationTime);
    return applyNpcIntentToTask(activeTask, selectedVillagerRuntime.replan.intent);
  }, [scheduleIndex, selectedVillagerRuntime, simulationTime]);
  const selectedVillagerMemorySummary = useMemo(() => {
    if (!selectedVillagerRuntime) {
      return [];
    }
    return [...selectedVillagerRuntime.memoryStore.shortTerm, ...selectedVillagerRuntime.memoryStore.longTerm]
      .sort((left, right) => right.importance - left.importance)
      .slice(0, 3);
  }, [selectedVillagerRuntime]);
  const selectedVillagerEvents = !selectedVillagerRuntime
    ? []
    : journalEventsRef.current
        .filter((event) => event.villagerIds.includes(selectedVillagerRuntime.villager.id))
        .slice(0, 3);
  const filteredJournalEvents = journalEventsRef.current
    .filter((event) => eventTypeFilter === "all" || event.type === eventTypeFilter)
    .filter((event) => eventVillagerFilter === "all" || event.villagerIds.includes(eventVillagerFilter))
    .slice(0, 20);
  const observabilityTotals = useMemo(() => {
    let requestCount = 0;
    let validDecisionCount = 0;
    let rewrittenDecisionCount = 0;
    let policyViolationCount = 0;
    let failedRequestCount = 0;
    let totalLatencyMs = 0;
    let requestTokens = 0;
    let responseTokens = 0;
    let totalTokens = 0;
    for (const metrics of npcObservabilityByVillager.values()) {
      requestCount += metrics.requestCount;
      validDecisionCount += metrics.validDecisionCount;
      rewrittenDecisionCount += metrics.rewrittenDecisionCount;
      policyViolationCount += metrics.policyViolationCount;
      failedRequestCount += metrics.failedRequestCount;
      totalLatencyMs += metrics.totalLatencyMs;
      requestTokens += metrics.requestTokens;
      responseTokens += metrics.responseTokens;
      totalTokens += metrics.totalTokens;
    }
    const averageLatencyMs = requestCount > 0 ? Math.round(totalLatencyMs / requestCount) : 0;
    return {
      requestCount,
      validDecisionCount,
      rewrittenDecisionCount,
      policyViolationCount,
      failedRequestCount,
      averageLatencyMs,
      requestTokens,
      responseTokens,
      totalTokens,
    };
  }, [npcObservabilityByVillager]);

  useEffect(() => {
    if (!hydrationFinishedRef.current) {
      return;
    }
    if (tick % SNAPSHOT_PERSIST_INTERVAL_TICKS !== 0) {
      return;
    }
    if (latestPersistedTickRef.current === tick) {
      return;
    }
    latestPersistedTickRef.current = tick;

    void fetch("/api/simulation-snapshot", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        snapshot: createWorldSnapshot(tick, simulationTime.day, simulationTime.minuteOfDay, villagerRuntime),
      }),
    }).catch((error) => {
      console.error("[simulation] Snapshot persist failed", error);
    });
  }, [simulationTime.day, simulationTime.minuteOfDay, tick, villagerRuntime]);

  return (
    <main className="game-shell">
      <section aria-label="Game viewport" className="game-viewport">
        <h1>Village Viewport</h1>
        <p>
          Camera ({camera.x}, {camera.y}) · Arrow keys or controls to pan.
        </p>
        <section aria-label="NPC observer panel" className="observer-panel">
          <h2>Observer Panel</h2>
          <div className="observer-panel__list" role="listbox" aria-label="Villager selector">
            {villagerRuntime.map((runtime) => (
              <button
                key={runtime.villager.id}
                type="button"
                role="option"
                aria-selected={runtime.villager.id === selectedVillagerId}
                className={runtime.villager.id === selectedVillagerId ? "is-selected" : undefined}
                onClick={() => setSelectedVillagerId(runtime.villager.id)}
              >
                {runtime.villager.name}
              </button>
            ))}
          </div>
          {selectedVillagerRuntime ? (
            <div className="observer-panel__detail">
              <p>Status: {selectedVillagerRuntime.npcState}</p>
              <p>Task: {selectedVillagerTask?.action ?? "observe"}</p>
              <p>
                Destination: {selectedVillagerTask?.targetTileId ?? selectedVillagerRuntime.movement.currentTileId}
              </p>
              <p>
                Intent:{" "}
                {selectedVillagerRuntime.replan.intent
                  ? `${selectedVillagerRuntime.replan.intent.action} (${selectedVillagerRuntime.replan.intent.reasoning})`
                  : "none"}
              </p>
              <ul>
                {selectedVillagerMemorySummary.map((memory) => (
                  <li key={memory.id}>{memory.summary}</li>
                ))}
                {selectedVillagerMemorySummary.length === 0 ? <li>No recent memories</li> : null}
              </ul>
              <ul>
                {selectedVillagerEvents.map((event) => (
                  <li key={event.id}>{event.summary}</li>
                ))}
                {selectedVillagerEvents.length === 0 ? <li>No recent events</li> : null}
              </ul>
              <button type="button" onClick={() => setEventVillagerFilter(selectedVillagerRuntime.villager.id)}>
                Filter timeline by {selectedVillagerRuntime.villager.name}
              </button>
            </div>
          ) : null}
        </section>
        <div
          className="viewport-grid"
          role="img"
          aria-label="Visible village tile window"
          style={{
            gridTemplateColumns: `repeat(${VIEWPORT_TILE_WIDTH}, ${VIEWPORT_TILE_SIZE}px)`,
            gridTemplateRows: `repeat(${VIEWPORT_TILE_HEIGHT}, ${VIEWPORT_TILE_SIZE}px)`,
          }}
        >
          {visibleTiles.map(({ tile, viewport }) => (
            <div
              key={tile.id}
              className={`viewport-tile viewport-tile--${tile.type}`}
              data-walkable={tile.walkable}
              data-viewport-coordinate={`${viewport.x},${viewport.y}`}
              aria-label={`${tile.type} tile at ${tile.coordinate.x},${tile.coordinate.y}`}
              style={{
                gridColumnStart: viewport.x + 1,
                gridRowStart: viewport.y + 1,
              }}
            >
              <span className="viewport-tile__token">{TILE_VISUAL_TOKENS[tile.type]}</span>
              <span className="viewport-tile__coordinate">
                {tile.coordinate.x},{tile.coordinate.y}
              </span>
            </div>
          ))}
          {visibleVillagers.map(({ runtime, viewport }) => (
            <div
              key={runtime.villager.id}
              className="viewport-villager"
              aria-label={`${runtime.villager.name} is ${runtime.npcState}`}
              style={{
                gridColumnStart: viewport.x + 1,
                gridRowStart: viewport.y + 1,
              }}
            >
              <span className="viewport-villager__token" data-animation-key={runtime.animation.key}>
                {runtime.animation.frameToken}
              </span>
              {runtime.actionExecution && runtime.actionExecution.completedAtTick === undefined ? (
                <span className="viewport-villager__action">
                  {getVillagerActionIndicator(runtime.actionExecution.action)}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <aside aria-label="Simulation HUD" className="game-hud">
        <h2>HUD</h2>
        <p>Day {simulationTime.day}</p>
        <p>Time {formattedTime}</p>
        <p>Status: {paused ? "Paused" : "Running"} · Speed {simulationSpeed}x</p>
        <div className="hud-controls" role="group" aria-label="Simulation controls">
          {simulationControls.map((control) => (
            <button
              key={control.id}
              type="button"
              aria-label={control.label}
              onClick={() => {
                if (control.id === "pause") {
                  pauseSimulation();
                } else if (control.id === "play") {
                  playSimulation();
                } else if (control.id === "faster") {
                  increaseSimulationSpeed();
                } else if (control.id === "slower") {
                  decreaseSimulationSpeed();
                } else if (control.id === "resetDay") {
                  resetDay();
                }
              }}
            >
              {control.label}
            </button>
          ))}
        </div>
        <h3>Camera</h3>
        <div className="camera-controls" role="group" aria-label="Camera controls">
          {cameraControls.map((control) => (
            <button
              key={control.id}
              type="button"
              aria-label={control.label}
              onClick={() => moveCamera(control.delta.x, control.delta.y)}
            >
              {control.label}
            </button>
          ))}
        </div>
      </aside>

      <aside aria-label="Simulation debug panel" className="game-debug">
        <h2>Debug Panel</h2>
        <p>
          Tile window: {VIEWPORT_TILE_WIDTH}×{VIEWPORT_TILE_HEIGHT}
        </p>
        <p>
          Clamp: x 0-{maxCameraX}, y 0-{maxCameraY}
        </p>
        <p>Tick: {tick}</p>
        <section aria-label="Economy balances">
          <h3>Economy</h3>
          <p>Crops: {resourceInventory.crops}</p>
          <p>Coins: {resourceInventory.coins}</p>
          <p>Goodwill: {resourceInventory.goodwill}</p>
        </section>
        <section aria-label="Event journal timeline" className="event-journal">
          <h3>Event Journal</h3>
          <div className="event-journal__filters">
            <label>
              Type
              <select
                value={eventTypeFilter}
                onChange={(event) => setEventTypeFilter(event.target.value as SimulationEventType | "all")}
              >
                <option value="all">All</option>
                <option value="movement_arrival">Movement</option>
                <option value="interaction">Interaction</option>
                <option value="ai_decision">AI decision</option>
                <option value="policy_violation">Policy violation</option>
              </select>
            </label>
            <label>
              NPC
              <select
                value={eventVillagerFilter}
                onChange={(event) => setEventVillagerFilter(event.target.value as VillagerId | "all")}
              >
                <option value="all">All villagers</option>
                {villagers.map((villager) => (
                  <option key={villager.id} value={villager.id}>
                    {villager.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ul className="event-journal__timeline">
            {filteredJournalEvents.map((event) => (
              <li key={event.id}>
                <button type="button" onClick={() => setSelectedVillagerId(event.villagerIds[0])}>
                  D{event.day} {formatMinuteOfDay(event.minuteOfDay)} · {event.summary}
                </button>
              </li>
            ))}
            {filteredJournalEvents.length === 0 ? <li>No events captured yet.</li> : null}
          </ul>
        </section>
        <section aria-label="AI observability metrics" className="event-journal">
          <h3>AI Observability</h3>
          <p>Requests: {observabilityTotals.requestCount}</p>
          <p>Decision validity (accepted): {observabilityTotals.validDecisionCount}</p>
          <p>Decision validity (rewritten): {observabilityTotals.rewrittenDecisionCount}</p>
          <p>Policy violations: {observabilityTotals.policyViolationCount}</p>
          <p>Failed requests: {observabilityTotals.failedRequestCount}</p>
          <p>Average latency: {observabilityTotals.averageLatencyMs}ms</p>
          <p>
            Tokens (prompt/response/total): {observabilityTotals.requestTokens}/
            {observabilityTotals.responseTokens}/{observabilityTotals.totalTokens}
          </p>
          <ul className="event-journal__timeline">
            {[...npcObservabilityByVillager.entries()].map(([villagerId, metrics]) => (
              <li key={villagerId}>
                {villagers.find((villager) => villager.id === villagerId)?.name ?? villagerId}: req {metrics.requestCount}
                , valid {metrics.validDecisionCount}, rewritten {metrics.rewrittenDecisionCount}, policy{" "}
                {metrics.policyViolationCount}, fail {metrics.failedRequestCount}, tokens {metrics.totalTokens}
              </li>
            ))}
            {npcObservabilityByVillager.size === 0 ? <li>No AI requests captured yet.</li> : null}
          </ul>
        </section>
      </aside>
    </main>
  );
}
