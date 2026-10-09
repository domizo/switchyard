export function Icon({
  name,
}: {
  name: "branch" | "plus" | "download" | "check" | "arrow";
}) {
  const paths = {
    branch: (
      <>
        <path d="M5 12h5l7-7M10 12l7 7" />
        <circle cx="4" cy="12" r="2" />
        <circle cx="19" cy="4" r="2" />
        <circle cx="19" cy="20" r="2" />
      </>
    ),
    plus: <path d="M12 4v16M4 12h16" />,
    download: (
      <>
        <path d="M12 3v12m-5-5l5 5 5-5M4 15v5h16v-5" />
      </>
    ),
    check: <path d="m5 12 4 4 10-10" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
