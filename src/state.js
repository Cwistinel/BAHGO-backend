// Shared mutable state used across UI/functions/*.
// Kept as properties on one object (rather than separate `let` exports)
// so every module that imports `state` sees live updates.
export const state = {
    stationsUnsubscribe: null,
    stations: [],
    stationChart: null,
};
