window.__ModuleLoader__.load({
	id: "dsh-workorder-plugin",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const jsx = require("react/jsx-runtime");
		const prim = require("@deepseek-ai/dsh-client-ui-primitives");

		/** Dictionary namespace owned by this plugin. */
		const NS = "settings.workorder";
		/**
		 * The settings namespace is the profile entry id from cordis.patch.yml,
		 * i.e. the loader row this package was inserted as -- not the package name.
		 */
		const CFG_NS = "dsh-workorder-plugin";

		/** Provider ids come from the generated CATALOG, so the list always matches the profile. */

		/**
		 * Model ids per provider. GENERATED -- do not hand-edit.
		 * Regenerate with tools/sync-catalog.ps1 after changing models in the
		 * Models settings page; the generator reads the profile's cordis.patch.yml,
		 * which is the same file that page writes to.
		 */
		// <catalog:start>
		const CATALOG = {};
		/** Model ids whose provider config declares an `image` input modality. */
		const VISION = new Set();		// <catalog:end>


		const zh = {
			title: "任务委派",
			description: "规划用强模型，执行用便宜模型。",
			plannerSection: "规划 · planner",
			workerSection: "执行 · executor",
			planner: "规划模型（planner）",
			plannerHint: "每轮只调用一次，负责读代码、写任务卡。",
			worker: "执行模型（executor）",
			workerHint: "承担全部上下文和多轮迭代，选额度大的。",
			provider: "提供方",
			providerHint: "决定下面的模型列表。",
			visionNote: "👁 = 支持读图。涉及 UI、截图或视觉比对的任务，把图片路径写进任务卡。",
			unavailable: "该插件当前未加载，暂时无法配置。",
			readOnly: "本部署的设置为只读。",
			save: "保存",
			saving: "保存中…",
			saveFailed: "本部署没有接受这些值，已保留供你修改。",
		};

		const en = {
			title: "Task delegation",
			description: "Strong model plans, cheap model executes.",
			plannerSection: "Plan · planner",
			workerSection: "Execute · executor",
			planner: "Planner model",
			plannerHint: "Called once per turn: reads code, writes the task card.",
			worker: "Executor model",
			workerHint: "Carries all context and iteration; pick a large quota.",
			provider: "Provider",
			providerHint: "Determines the model list below.",
			visionNote: "👁 = accepts images. For UI, screenshot or visual-diff tasks, put the image path in the task card.",
			unavailable: "This plugin is not loaded, so it cannot be configured right now.",
			readOnly: "This deployment stores settings read-only.",
			save: "Save",
			saving: "Saving…",
			saveFailed: "The deployment did not accept these values; they were left for you to correct.",
		};

		/** The editable fields, in render order. */
		const FIELDS = ["plannerProvider", "planner", "workerProvider", "worker"];

		/**
		 * Pull the current text out of a field snapshot. The exact key is not
		 * part of any public contract, so every plausible spelling is tried and
		 * an unknown shape degrades to an empty string instead of throwing.
		 */
		function fieldValue(field) {
			if (!field || typeof field !== "object") return "";
			for (const key of ["value", "draft", "text", "current"]) {
				if (typeof field[key] === "string") return field[key];
			}
			return "";
		}

		const UNCONFIGURED = [["", "（未生成：先跑 tools/sync-catalog.ps1）"]];

		function optionsFor(kind, providerId) {
			if (kind.endsWith("Provider")) {
				const ids = Object.keys(CATALOG);
				return ids.length === 0 ? UNCONFIGURED : ids.map((id) => [id, id]);
			}
			const ids = CATALOG[providerId] || CATALOG[Object.keys(CATALOG)[0]] || [];
			if (ids.length === 0) return UNCONFIGURED;
			return ids.map((id) => [id, `${VISION.has(id) ? "👁 " : ""}${id}`]);
		}

		function Select(props) {
			const { value, disabled, hint, onChange } = props;
			const list = props.options.slice();
			if (value && !list.some((entry) => entry[0] === value)) list.unshift([value, value]);
			return jsx.jsxs("div", {
				style: { display: "flex", flexDirection: "column", gap: "4px" },
				children: [
					jsx.jsx("select", {
						value,
						disabled,
						onChange: (event) => onChange(event.target.value),
						style: {
							width: "100%",
							padding: "6px 8px",
							borderRadius: "6px",
							border: "1px solid rgba(128,128,128,0.35)",
							background: "transparent",
							color: "inherit",
						},
						children: list.map((entry) => jsx.jsx("option", { value: entry[0], children: entry[1] })),
					}),
					hint ? jsx.jsx("div", { style: { fontSize: "12px", opacity: 0.65 }, children: hint }) : null,
				],
			});
		}

		/** Debug aid: shows the snapshot shape when the selects render empty. */
		function debugText(state) {
			try {
				const pick = (field) => {
					if (!field || typeof field !== "object") return field ?? null;
					const out = {};
					for (const key of Object.keys(field)) {
						const value = field[key];
						out[key] = typeof value === "function" ? "[fn]" : value;
					}
					return out;
				};
				return JSON.stringify(
					{
						shell: Object.keys(state),
						writable: state.writable,
						plannerProvider: pick(state.plannerProvider),
						workerProvider: pick(state.workerProvider),
						planner: pick(state.planner),
						worker: pick(state.worker),
					},
					null,
					2,
				);
			} catch (err) {
				return String(err);
			}
		}

		/**
		 * The Plugins-page card: the actual form, plus a collapsible snapshot dump.
		 * @param props - view, locale reader, snapshot, and the form's actions.
		 */
		function WorkorderCard(props) {
			const { t } = props;
			const state = props.useWorkorderCard((snapshot) => snapshot);
			if (props.view === "summary") return t("description");

			const disabled = !state.writable;
			const firstProvider = Object.keys(CATALOG)[0] || "";
			const plannerProviderId = fieldValue(state.plannerProvider) || fieldValue(state.provider) || firstProvider;
			const workerProviderId = fieldValue(state.workerProvider) || fieldValue(state.provider) || firstProvider;
			const row = (kind, label, hint, providerId) =>
				jsx.jsxs("div", {
					style: { marginBottom: "12px" },
					children: [
						jsx.jsx("div", { style: { fontWeight: 500, marginBottom: "4px" }, children: label }),
						jsx.jsx(Select, {
							value: fieldValue(state[kind]),
							options: optionsFor(kind, providerId),
							disabled,
							hint,
							onChange: (value) => props.edit(kind, value),
						}),
					],
				});
			const section = (title) =>
				jsx.jsx("div", {
					style: {
						fontWeight: 600,
						fontSize: "13px",
						margin: "18px 0 8px",
						paddingTop: "10px",
						borderTop: "1px solid rgba(128,128,128,0.2)",
					},
					children: title,
				});

			return jsx.jsx(prim.SettingsForm, {
				labels: {
					unavailable: t("unavailable"),
					readOnly: t("readOnly"),
					saveFailed: t("saveFailed"),
					save: t("save"),
					saving: t("saving"),
				},
				state,
				onSave: props.save,
				onDiscard: props.discard,
				children: jsx.jsxs("div", {
					children: [
						section(t("plannerSection")),
						row("plannerProvider", t("provider"), null, null),
						row("planner", t("planner"), t("plannerHint"), plannerProviderId),
						section(t("workerSection")),
						row("workerProvider", t("provider"), null, null),
						row("worker", t("worker"), t("workerHint"), workerProviderId),
						jsx.jsx("div", {
							style: { fontSize: "12px", opacity: 0.6, margin: "4px 0 12px" },
							children: t("visionNote"),
						}),
						jsx.jsxs("details", {
							children: [
								jsx.jsx("summary", { style: { fontSize: "12px", opacity: 0.5 }, children: "debug" }),
								jsx.jsx("pre", {
									style: { fontSize: "11px", whiteSpace: "pre-wrap", opacity: 0.7 },
									children: debugText(state),
								}),
							],
						}),
					],
				}),
			});
		}

		/** Bridges the `dsh-workorder-plugin` settings scope onto the page's staged form. */
		class WorkorderCardController {
			constructor(scope) {
				this.form = new prim.SettingsFormModel(
					scope,
					FIELDS.map((name) => prim.settingsTextField(name)),
				);
				this.store = this.form.bind(() => this.projection());
			}

			projection() {
				const out = { ...this.form.shell() };
				for (const name of FIELDS) out[name] = this.form.field(name);
				return out;
			}

			inject() {
				return { hooks: { workorderCard: this.store }, ...this.form.actions() };
			}

			dispose() {
				this.form.dispose();
			}
		}

		/** Required browser services (cordis fiber inject). */
		const inject = ["slots", "locale", "configForms"];

		/**
		 * Mount the delegation settings card while the Host serves its namespace.
		 * @param ctx - the browser plugin context.
		 */
		function apply(ctx) {
			try {
				const t = ctx.locale.bind(NS);
				ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-workorder-plugin: dictionaries");

				const card = new WorkorderCardController(ctx.configForms.get(CFG_NS));
				ctx.effect(
					() => () => {
						card.dispose();
					},
					"dsh-workorder-plugin: form subscription",
				);

				ctx.effect(
					() =>
						ctx.configForms.whileServed([CFG_NS], () =>
							ctx.slots.inject("plugins.item", () =>
								ctx.slots.register(
									{
										name: "plugins.item",
										id: "dsh-workorder-plugin",
										order: 100,
										label: () => t("title"),
										locale: NS,
										inject: () => card.inject(),
									},
									WorkorderCard,
								),
							),
						),
					"dsh-workorder-plugin: page",
				);
			} catch (err) {
				console.error("[dsh-workorder-plugin] client mount failed", err);
			}
		}

		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
