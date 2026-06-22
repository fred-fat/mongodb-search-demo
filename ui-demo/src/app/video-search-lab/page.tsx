import Link from "next/link";

import { VideoSearchDemo } from "@/components/video-search-demo";

export default function VideoSearchLabPage() {
  return (
    <main className="min-h-screen bg-[#f5f5f2] text-zinc-950">
      <section className="bg-black px-4 py-2 text-center text-xs font-medium text-white sm:text-sm">
        MongoDB Unified Data Platform Demo | Video Search Lab
      </section>
      <section className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 lg:px-8">
        <Link href="/" className="inline-flex rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:border-black">
          返回商品搜索 Demo
        </Link>
      </section>
      <VideoSearchDemo />
    </main>
  );
}
