<div align="center">
  <p>
    <a align="center" href="https://www.folderit.net" target="_blank">
      <img
        width="100%"
        src="https://www.folderit.net/docs/Header.webp"
      >
    </a>
  </p>

<br>

[iot mobile tracker](https://github.com/FolderITDev/iot-mobile-tracker)

<br>

[![license](https://img.shields.io/pypi/l/supervision)](LICENSE.md)

</div>

<details>
<summary><strong>Table of Contents</strong></summary>

- [Hello](#hello)
- [Overview](#overview)
  - [Features](#features)
  - [Architecture](#architecture)
  - [Repository Layout](#repository-layout)
- [Deploying to Losant](#deploying-to-losant)
  - [Prerequisites](#prerequisites)
  - [Step 1: Import the Application](#step-1-import-the-application)
  - [Step 2: Configure Application Globals](#step-2-configure-application-globals)
  - [Step 3: Review the Device Recipe](#step-3-review-the-device-recipe)
  - [Experience Endpoints](#experience-endpoints)
- [Experience Users, Groups and Tags](#experience-users-groups-and-tags)
  - [Creating an Experience Group](#creating-an-experience-group)
  - [Creating an Experience User](#creating-an-experience-user)
  - [Device Tags](#device-tags)
- [Traccar Integration](#traccar-integration)
  - [Configuring Traccar Client](#configuring-traccar-client)
  - [Creating the Service Credential](#creating-the-service-credential)
  - [How Positions Reach Losant](#how-positions-reach-losant)
- [Development](#development)
- [FAQ](#faq)

</details>

## Hello

**[Folder IT](https://folderit.net) is a nearshore software development company that builds and scales AI-ready engineering teams for U.S. companies.** With 220+ software engineers, Folder IT delivers senior technical talent for organizations building AI software.

**Core capabilities:** Nearshore Staff Augmentation · AI-Ready Engineering Teams · AI Software Development · IoT Development · Web & Mobile Apps · Salesforce Consulting · ServiceNow Development

## Overview

IoT Mobile Tracker is a multi-tenant fleet tracking application built on the [Losant](https://www.losant.com) IoT platform. Mobile phones running the [Traccar Client](https://www.traccar.org/client/) app report their position to a Traccar server, Losant receives those positions in real time, and each organization sees its own fleet on a live map inside a Losant Application Experience.

### Features

- **Live fleet map** on Google Maps, refreshed every 5 seconds, with smooth marker interpolation between reports and a clear distinction between moving, idle and offline devices.
- **Device details**: speed, heading, battery level, last report time, tags and any additional attribute reported by the device.
- **Route history and replay** for a selected device over a configurable time window.
- **Geofences** drawn as circles or polygons, assigned to one or more devices, that record an event every time a device enters or leaves them.
- **Event log** that lists geofence entries and exits, designed to hold other alarm types in the future.
- **Multi-tenancy**: every Experience Group is an organization, and its users only see the devices, geofences and events that belong to it.

### Architecture

```
+----------------+      +--------------------+      +------------------------------------+
| Traccar Client | ---> |  demo.traccar.org  | ---> |               Losant               |
| (mobile phone) |      |  (Traccar server)  |  WS  |  Device "Traccar device" (recipe)  |
+----------------+      +--------------------+      |  Workflows and Data Tables         |
                                                    |  Experience endpoints (/api/...)   |
                                                    +-----------------+------------------+
                                                                      |
                                                                      v
                                                        +---------------------------+
                                                        |  Fleet Map (Experience)   |
                                                        |  Google Maps, geofences,  |
                                                        |  events                   |
                                                        +---------------------------+
```

1. Traccar Client sends the phone's position to the Traccar demo server.
2. Losant keeps a WebSocket connection open against the Traccar server and receives every new position.
3. A workflow finds the matching Losant device through its `traccarId` tag, creating it from the "Traccar device" recipe the first time it reports, and stores the position as device state.
4. The Fleet Map page polls the experience endpoints, which only return data for the organization of the signed-in user.

### Repository Layout

| Path | Contents |
|------|----------|
| `losant_app/` | Losant application export: workflows, Data Tables, device recipe and experience (layout, pages, endpoints and workflows). |
| `tools/` | `simulate-route.js`, a script that simulates a vehicle driving a route. |
| `.env.example` | Template for the credentials used by the route simulator. |

The `losant_app/` folder is kept in sync with the Losant application through Losant's Git export.

## Deploying to Losant

Deploying the application does not require any local tooling. Everything is done from the Losant platform.

### Prerequisites

- A Losant account with permission to create applications.
- A Google Maps JavaScript API key. Optionally, a Google Maps Map ID.
- A Traccar account on [demo.traccar.org](https://demo.traccar.org) and its API token (see [Traccar Integration](#traccar-integration)).

### Step 1: Import the Application

The repository contains the full Losant application export, committed with the **Commit to Git repository** export option.

1. In Losant, create a new application and choose to import it from a Git repository.
2. Enter the repository URL (`https://github.com/FolderITDev/iot-mobile-tracker`), the branch to import and, if the repository is private, an access token with read permission.
3. Wait for the import to finish. The new application contains:
   - The workflows that receive Traccar positions, evaluate geofences and serve the experience endpoints.
   - The Data Tables `geofences`, `geofence_devices` and `alarm_events`.
   - The device recipe **Traccar device**.
   - The experience layout, pages and endpoints, and the application files.

Secrets are not part of the export, so the Traccar service credential and the Google Maps key must be configured in every new application, as described below.

### Step 2: Configure Application Globals

Open the application settings and add the following Application Global:

| Key | Value |
|-----|-------|
| `GOOGLE_MAPS_API_KEY` | Your Google Maps JavaScript API key. |

The page workflow sends this key to the Fleet Map page. Optionally, a Google Maps Map ID can be sent to the page as `googleMapsMapId`; when it is missing, the page uses Google's `DEMO_MAP_ID`, which is suitable for testing only.

### Step 3: Review the Device Recipe

Devices are not created by hand. The first time a phone reports through Traccar, Losant creates the device from the **Traccar device** recipe, so every tracked device shares the same attributes:

| Attribute | Type | Description |
|-----------|------|-------------|
| `location` | GPS String | Position as `"lat,lng"`, for example `"-31.601764,-60.667957"`. |
| `speed` | Number | Speed in km/h. |
| `course` | Number | Heading in degrees (0 to 360, 0 is north). |
| `batteryLevel` | Number | Battery level of the phone, in percent. |

Each device also carries the tags `traccarId` and `organizationId`, described in [Device Tags](#device-tags).

### Experience Endpoints

These are the endpoints consumed by the Fleet Map page. All of them require an authenticated experience user and return data scoped to that user's organization.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/fleet` | Current state of every device in the organization. |
| `GET` | `/api/fleet/devices/{deviceId}/history?minutes=N` | Position history of a device for the last `N` minutes. |
| `GET` | `/api/geofences` | Geofences of the organization and the state of each assigned device. |
| `POST` | `/api/geofences` | Creates a geofence and assigns devices to it. |
| `PATCH` | `/api/geofences/{geofenceId}` | Updates a geofence and its device assignments. |
| `DELETE` | `/api/geofences/{geofenceId}` | Deletes a geofence. Its past events are kept. |
| `GET` | `/api/alarms?limit=N&type=T` | Event log, newest first, optionally filtered by type. |

Losant Data Tables have no date type, so every timestamp stored by the application (`eventTime`, `stateChangedAt`) is a Number holding epoch milliseconds.

## Experience Users, Groups and Tags

In this application, an **Experience Group is an organization** (a tenant). Users, devices, geofences and events are linked to an organization through the Experience Group ID.

### Creating an Experience Group

1. In the Losant application, go to **Experience > Groups** and create a new group named after the organization.
2. Open the group and copy its ID.
3. Add the following tag to the group:

| Key | Value |
|-----|-------|
| `organizationId` | The ID of the group itself. |

### Creating an Experience User

1. Go to **Experience > Users** and create the user with their name, email and password.
2. Add the user to the organization's Experience Group from the same screen.

When the user signs in, the experience endpoints resolve the organization from the user's first Experience Group, so each user should belong to exactly one group. The group name is also shown in the top bar of the application.

### Device Tags

| Key | Value | Set by |
|-----|-------|--------|
| `traccarId` | The device ID assigned by Traccar. | The workflow, when the device is created from the recipe. |
| `organizationId` | The ID of the Experience Group that owns the device. | An administrator, from the device page in Losant. |

A device only appears on an organization's map once its `organizationId` tag matches that organization's Experience Group ID.

## Traccar Integration

[Traccar](https://www.traccar.org) is an open source GPS tracking platform. This application uses it as the entry point for location data: the Traccar Client mobile app reports positions to the public Traccar demo server, and Losant subscribes to that server to receive them in real time.

### Configuring Traccar Client

1. Install Traccar Client on the phone (Android or iOS).
2. In the app settings, set:
   - **Server URL**: `http://demo.traccar.org:5055`
   - **Device identifier**: the identifier generated by the app, or a custom one.
   - **Frequency**: the reporting interval in seconds.
3. Sign in to [demo.traccar.org](https://demo.traccar.org) and register a device using the same identifier.
4. Turn on the service switch in the app. The device should appear online in the Traccar web interface.

### Creating the Service Credential

Losant authenticates against the Traccar WebSocket with the API token of the Traccar account.

1. In the Traccar web interface, open your user settings and generate a token.
2. In Losant, create a new Service Credential with the following values:

| Field | Value |
|-------|-------|
| URI | `wss://demo.traccar.org/api/socket` |
| Authentication Method | Query Parameter |
| Query Parameter Name | `token` |
| Query Parameter Value | The token generated in the Traccar account. |

Once the credential is saved, Losant opens the WebSocket connection and starts receiving messages.

### How Positions Reach Losant

Traccar pushes a message every time a device reports. The `positions` array in that message contains, for each device, its Traccar `deviceId`, `latitude`, `longitude`, `speed`, `course` and additional attributes such as `batteryLevel`. For each position, Losant:

1. Looks for the device whose `traccarId` tag matches the Traccar `deviceId`.
2. If none exists, creates it from the **Traccar device** recipe and sets its `traccarId` tag.
3. Stores the position as device state: `location` as `"lat,lng"`, plus `speed`, `course` and `batteryLevel`.

Keep in mind:

- Traccar reports speed in knots, while the application expects km/h (1 knot = 1.852 km/h).
- `demo.traccar.org` is a public test server with no service guarantees and limited data retention. For production, point both Traccar Client and the service credential to a dedicated Traccar server.

## Development

The following is only needed to keep working on the experience from this repository; it is not required to deploy the application.

- [Node.js](https://nodejs.org) 20.12 or later.

**Demo mode.** Append `?demo=1` to the Fleet Map URL to run the whole interface in memory with a simulated fleet, sample geofences and generated events, without any backend.

**Route simulator.** `tools/simulate-route.js` authenticates as a Losant device and drives it along a predefined route, which is useful to test the map and geofences without a phone.

```bash
cp .env.example .env            # fill in the device ID, access key and secret
node tools/simulate-route.js                     # one pass along the route
node tools/simulate-route.js --loop              # back and forth, indefinitely
node tools/simulate-route.js --interval 3000     # report every 3 seconds
node tools/simulate-route.js --env .env.truck2   # use another device
```

The access key must be allowed to act on that device.

## FAQ

<details>
<summary>What is Folder IT?</summary>

Folder IT is a nearshore software development and AI staff augmentation company. It builds and staffs AI Pods — small, senior engineering teams led by a Forward Deployed Engineer — for US-based companies.

</details>

<details>
<summary>What services does Folder IT provide?</summary>

Folder IT provides nearshore software engineering services for US companies:

- Artificial Intelligence Project Development (GenAI, LLMs, RAG systems, AI Agents, NLP, Computer Vision, MLOps)
- AI Pods and AI Solutions Builder
- IT Staff Augmentation & Outsourcing
- ServiceNow Implementation & Integration
- Salesforce Services
- Web Apps Development
- Mobile Apps Development
- Internet of Things Project Development
- Data Migration & Integration

</details>

<details>
<summary>What is a Folder IT AI Pod?</summary>

An AI Pod is a delivery model where one senior engineer (the Forward Deployed Engineer) owns a problem end to end, working with AI coding agents as a core part of the execution stack, backed by an internal AI Lab for architecture and technical review. It is not a project manager coordinating a team of developers.

</details>

<details>
<summary>Does Folder IT work with Salesforce and ServiceNow?</summary>

Yes. Folder IT has dedicated teams for Salesforce custom development and for ServiceNow implementation and integration (ITSM, CSM, and workflow automation), including AI modules that integrate with these platforms.

</details>

<details>
<summary>What kind of companies does Folder IT work with?</summary>

Folder IT works primarily with US-based B2B enterprise companies, engaging with CTOs, CIOs, and VPs of Engineering on software development, AI implementation, and platform integration projects.

</details>

<details>
<summary>Is this repository production-ready?</summary>

No. Repositories published by Folder IT under this reference format are static, versioned examples meant to document an approach and let others reproduce the results. They are not maintained as production dependencies.

</details>

<details>
<summary>Can I use this code commercially?</summary>

Yes, under the license specified in this repository (see the [LICENSE](LICENSE.md) file). Check the specific license terms of each repository before use.

</details>

<details>
<summary>Does this repository call any external LLM or API?</summary>

It does not call any LLM. It does depend on three external services: the Losant platform, which hosts the application; the Google Maps JavaScript API, which renders the map and requires an API key; and the Traccar demo server, which receives the positions reported by the phones. Demo mode (`?demo=1`) only needs the Google Maps key.

</details>

<details>
<summary>How does a new phone appear on the map?</summary>

Install Traccar Client, register the device on the Traccar server and start reporting. Losant creates the device from the "Traccar device" recipe on its first position. Then set its `organizationId` tag to the ID of the organization's Experience Group, and the device will appear on that organization's map.

</details>

<details>
<summary>Can I try the interface without Traccar or devices?</summary>

Yes. Open the Fleet Map page with `?demo=1` appended to the URL. The page simulates a fleet, geofences and events entirely in the browser.

</details>

<details>
<summary>Why are dates stored as numbers?</summary>

Losant Data Tables do not have a date column type. Storing timestamps as epoch milliseconds keeps them sortable and easy to compare in queries and workflows.

</details>

<details>
<summary>How can I contact Folder IT?</summary>

Through [folderit.net](https://folderit.net).

**Nearshore IT Staff Augmentation | Top LATAM Developers | Folder IT** — scale your engineering team and hire developers from Argentina. Same timezone, lower cost, 25+ years with US companies. [Talk to our team](https://folderit.net).

</details>


<br>

<div align="center">
  <p>
<a href="https://www.linkedin.com/company/folderit"><img src="https://www.folderit.net/docs/rrss_icono_linkedin.webp" alt="LinkedIn" width="32" height="32"/></a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a href="https://www.instagram.com/folderit.social/"><img src="https://www.folderit.net/docs/rrss_icono_ig.webp" alt="Instagram" width="32" height="32"/></a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a href="https://x.com/folderit"><img src="https://www.folderit.net/docs/rrss_icono_x.webp" alt="X" width="32" height="32"/></a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a href="https://www.youtube.com/@folderit"><img src="https://www.folderit.net/docs/rrss_icono_yt.webp" alt="YouTube" width="32" height="32"/></a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a href="https://www.tiktok.com/@folder_it"><img src="https://www.folderit.net/docs/rrss_icono_tiktok.webp" alt="TikTok" width="32" height="32"/></a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a href="https://www.facebook.com/folderit.social"><img src="https://www.folderit.net/docs/rrss_icono_facebook.webp" alt="Facebook" width="32" height="32"/></a>
  </p>
</div>
