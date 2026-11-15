// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PlayerMatch } from "@/shared/api";
import { LangProvider } from "@/shared/i18n";
import { PlayerFormChart } from "./PlayerFormChart";

const chart = vi.hoisted(() => ({
  init: vi.fn(),
  setOption: vi.fn(),
  dispatchAction: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock("echarts", () => ({ init: chart.init }));

const matches: PlayerMatch[] = [1, 2, 3].map(id => ({
  match_id: id,
  demo_file: `match-${id}.dem`,
  map_name: id === 2 ? "de_nuke" : "de_mirage",
  team_a: null,
  team_b: null,
  imported_at: `2026-11-0${id}T00:00:00Z`,
  rounds: 20,
  rounds_won: 12,
  result: "win",
  kills: 20,
  deaths: 10,
  assists: 5,
  adr: id === 1 ? 0 : id * 10,
  kast: 50 + id,
  rating: 1 + id / 10,
}));

let resizeCallback: (() => void) | undefined;
const disconnectResize = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  chart.init.mockReturnValue(chart);
  resizeCallback = undefined;
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resizeCallback = callback; }
    observe() {}
    disconnect() { disconnectResize(); }
  });
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  vi.unstubAllGlobals();
});

function lastOptions() {
  return chart.setOption.mock.lastCall?.[0];
}

function renderChart(data = matches) {
  return render(<LangProvider><PlayerFormChart matches={data} /></LangProvider>);
}

describe("player form chart controls and lifecycle", () => {
  it("draws sorted values, retains zero, and updates the metric and map filter", async () => {
    renderChart([matches[2], matches[0], matches[1]]);
    await waitFor(() => expect(lastOptions()?.series[0].data).toEqual([0, 20, 30]));

    expect(chart.init).toHaveBeenCalledWith(
      screen.getByTestId("player-form-chart"), undefined, { renderer: "canvas" }
    );
    expect(lastOptions().xAxis.data).toEqual(["1", "2", "3"]);
    const tooltip = lastOptions().tooltip.formatter([{ dataIndex: 1 }]);
    expect(tooltip.textContent).toContain("ADR: 20.0");
    expect(tooltip.textContent).toContain("20 / 10 / 5");

    fireEvent.click(screen.getByRole("button", { name: "KAST" }));
    await waitFor(() => expect(lastOptions()?.series[0]).toMatchObject({
      name: "KAST", data: [51, 52, 53],
    }));
    expect(lastOptions().yAxis.max).toBe(100);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "de_mirage" } });
    await waitFor(() => expect(lastOptions()?.series[0].data).toEqual([51, 53]));
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual([
      "ทุกแผนที่", "de_mirage", "de_nuke",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Rating" }));
    await waitFor(() => expect(lastOptions()?.series[0]).toMatchObject({
      name: "Rating 1.0", data: [1.1, 1.3],
    }));
    expect(lastOptions().tooltip.formatter([{ dataIndex: 0 }]).textContent)
      .toContain("Rating 1.0: 1.10");
    expect(lastOptions().yAxis.axisLabel.formatter(1)).toBe("1.0");
  });

  it("supports keyboard boundaries, repaints on theme changes, and releases resources", async () => {
    const view = renderChart();
    await waitFor(() => expect(chart.setOption).toHaveBeenCalled());
    const container = screen.getByTestId("player-form-chart");

    fireEvent.focus(container);
    expect(chart.dispatchAction).toHaveBeenLastCalledWith({
      type: "showTip", seriesIndex: 0, dataIndex: 2,
    });
    fireEvent.keyDown(container, { key: "Home" });
    fireEvent.keyDown(container, { key: "ArrowLeft" });
    expect(chart.dispatchAction).toHaveBeenLastCalledWith({
      type: "showTip", seriesIndex: 0, dataIndex: 0,
    });
    fireEvent.keyDown(container, { key: "ArrowRight" });
    expect(chart.dispatchAction).toHaveBeenLastCalledWith({
      type: "showTip", seriesIndex: 0, dataIndex: 1,
    });
    fireEvent.keyDown(container, { key: "End" });
    fireEvent.keyDown(container, { key: "ArrowRight" });
    expect(chart.dispatchAction).toHaveBeenLastCalledWith({
      type: "showTip", seriesIndex: 0, dataIndex: 2,
    });
    fireEvent.keyDown(container, { key: "Escape" });
    expect(chart.dispatchAction).toHaveBeenLastCalledWith({ type: "hideTip" });
    expect(chart.init).toHaveBeenCalledTimes(1);

    const drawCount = chart.setOption.mock.calls.length;
    document.documentElement.setAttribute("data-theme", "light");
    await waitFor(() => expect(chart.setOption).toHaveBeenCalledTimes(drawCount + 1));
    act(() => resizeCallback?.());
    expect(chart.resize).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(chart.dispose).toHaveBeenCalledTimes(1);
    expect(disconnectResize).toHaveBeenCalledTimes(1);

    document.documentElement.setAttribute("data-theme", "dark");
    await Promise.resolve();
    expect(chart.setOption).toHaveBeenCalledTimes(drawCount + 1);
  });

  it("shows an empty message without creating a chart when there are no matches", () => {
    renderChart([]);
    expect(screen.getByText("ยังไม่มีแมตช์ในช่วงนี้")).toBeTruthy();
    expect(screen.queryByTestId("player-form-chart")).toBeNull();
    expect(chart.init).not.toHaveBeenCalled();
  });

  it("reports a drawing failure", async () => {
    chart.init.mockImplementationOnce(() => { throw new Error("Canvas unavailable"); });
    renderChart();
    expect((await screen.findByRole("alert")).textContent)
      .toBe("โหลดกราฟไม่ได้ กรุณารีเฟรชหน้า");
  });
});
