import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { readConfig, storageMode, writeConfig } from "@/lib/config-store";
import type { TrackerConfig } from "@/lib/types";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const config = await readConfig();
    return NextResponse.json({ config, storage: storageMode() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read config" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const config = (await request.json()) as TrackerConfig;

    if (
      !config?.search ||
      !Array.isArray(config.search.queries) ||
      !Array.isArray(config.pincodes) ||
      !config.price
    ) {
      return NextResponse.json({ error: "Invalid config shape" }, { status: 400 });
    }
    if (config.pincodes.some((p) => !/^\d{6}$/.test(p))) {
      return NextResponse.json(
        { error: "Pincodes must be 6 digits" },
        { status: 400 }
      );
    }
    if (config.price.min >= config.price.max) {
      return NextResponse.json(
        { error: "Min price must be below max price" },
        { status: 400 }
      );
    }

    await writeConfig(config);
    return NextResponse.json({ ok: true, storage: storageMode() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save config" },
      { status: 500 }
    );
  }
}
