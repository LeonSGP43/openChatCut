import { afterEach, describe, expect, it, mock } from "bun:test";
import { getPosts, getSinglePost } from "@/lib/blog/query";

const originalFetch = globalThis.fetch;

function setFetch(nextFetch: typeof fetch) {
	(globalThis as { fetch: typeof fetch }).fetch = nextFetch;
}

afterEach(() => {
	setFetch(originalFetch);
});

describe("blog query fallbacks", () => {
	it("returns empty posts when marble posts endpoint is not available", async () => {
		const fetchMock = mock(async () => {
			return new Response("Not Found", {
				status: 404,
				statusText: "Not Found",
			});
		});

		setFetch(fetchMock as unknown as typeof fetch);

		const data = await getPosts();

		expect(data.posts).toEqual([]);
		expect(data.pagination.totalItems).toBe(0);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0]?.[0]).toContain("/posts");
	});

	it("returns null single post when marble post endpoint throws", async () => {
		const fetchMock = mock(async () => {
			throw new Error("network down");
		});

		setFetch(fetchMock as unknown as typeof fetch);

		const data = await getSinglePost({ slug: "missing-slug" });

		expect(data.post).toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0]?.[0]).toContain("/posts/missing-slug");
	});
});
