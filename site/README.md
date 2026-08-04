# Public website and customer web app

Serves `momentumlandscapingut.com` (marketing) and `momentumlandscapingut.com/#app`
(the customer web app, behind its own login). One file, one deployment — the app
is a hash route on the same page, which is why a desktop customer signs in at the
same URL and why the site and app can never drift apart.

Deployed by the Vercel project **momentum-site**
(`prj_tWY1cJIHCitpS9FPs7Sta3LL8Fr9`).

Until 2026-08-04 this source existed **only inside the Vercel deployment** — no
repo, anywhere. Every deploy was a full overwrite from whatever snapshot the
deployer happened to hold. It was recovered from deployment
`dpl_5yScovhv22HDF4Y6aHrde56KS7Pu` and committed here so that stops being true.
