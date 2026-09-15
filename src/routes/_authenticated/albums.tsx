import { createFileRoute, Outlet } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/albums")({
  head: () => ({
    meta: [
      { title: "Mes albums — PhotoZo" },
      {
        name: "description",
        content: "Retrouvez et gérez tous vos albums photos dans votre bibliothèque PhotoZo.",
      },
      { property: "og:title", content: "Mes albums — PhotoZo" },
      {
        property: "og:description",
        content: "Retrouvez et gérez tous vos albums photos dans votre bibliothèque PhotoZo.",
      },
    ],
  }),
  component: AlbumsLayout,
});

function AlbumsLayout() {
  return <Outlet />;
}
