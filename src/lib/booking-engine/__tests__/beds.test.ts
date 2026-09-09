import { describe, expect, it } from "vitest";
import { bedChoiceText, bedLabel, cleanBedOptions, isBedType, sortRoomsForBed } from "../beds";

describe("bed layouts", () => {
  it("recognises only twin and king", () => {
    expect(isBedType("twin")).toBe(true);
    expect(isBedType("king")).toBe(true);
    expect(isBedType("queen")).toBe(false);
    expect(cleanBedOptions(["king", "twin", "king", "sofa", null])).toEqual(["twin", "king"]);
    expect(cleanBedOptions(undefined)).toEqual([]);
  });

  it("describes a choice only when there is one", () => {
    expect(bedChoiceText(["twin", "king"], "en")).toBe("Twin beds or king bed — your choice");
    expect(bedChoiceText(["twin", "king"], "ar")).toBe("سريران منفصلان أو سرير كينغ — حسب اختياركم");
    expect(bedChoiceText(["king"], "en")).toBeNull();
    expect(bedLabel("twin", "ar")).toBe("سريران منفصلان");
  });

  it("puts rooms with the guest's layout first, unknown next, the rest last", () => {
    const rooms = [
      { room_number: "103", bed_type: "king" },
      { room_number: "101", bed_type: null },
      { room_number: "110", bed_type: "twin" },
      { room_number: "102", bed_type: "twin" },
    ];
    expect(sortRoomsForBed(rooms, "twin").map((r) => r.room_number)).toEqual(["102", "110", "101", "103"]);
    expect(sortRoomsForBed(rooms, null).map((r) => r.room_number)).toEqual(["101", "102", "103", "110"]);
  });
});
