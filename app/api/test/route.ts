import { NextResponse } from 'next/server';
import { runGeoRouteTests } from '@/tests/georoute.test';

export async function GET() {
  const testResults = runGeoRouteTests();
  return NextResponse.json(testResults);
}
