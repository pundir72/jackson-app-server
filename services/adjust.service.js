const axios = require("axios");
const config = require("../config/config");

class AdjustService {
  constructor() {
    this.baseURL = "https://s2s.adjust.com";
    this.analyticsBaseURL = "https://automate.adjust.com/reports-service";
    this.apiToken = config.ADJUST_API_TOKEN;
    this.appToken = config.ADJUST_APP_TOKEN;
    this.s2sSecret = config.ADJUST_S2S_SECRET;

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 30000,
    });

    this.analyticsClient = axios.create({
      baseURL: this.analyticsBaseURL,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(this.apiToken && { Authorization: `Bearer ${this.apiToken}` }),
      },
      timeout: 30000,
    });
  }

  isConfigured() {
    return !!(this.apiToken && this.appToken);
  }

  async sendEvent(eventData) {
    if (!eventData || !eventData.event_token) {
      throw Object.assign(new Error("event_token is required"), { status: 400 });
    }
    if (!this.isConfigured()) {
      throw Object.assign(new Error("Adjust S2S not configured — missing API or App token"), { status: 401 });
    }

    try {
      const params = {
        app_token: this.appToken,
        event_token: eventData.event_token,
      };
      if (this.s2sSecret) params.app_secret = this.s2sSecret;
      if (eventData.s2s) params.s2s = eventData.s2s;

      if (eventData.revenue !== undefined && eventData.revenue !== null) {
        params.revenue = Number(eventData.revenue);
        params.currency = eventData.currency || "USD";
      }
      if (eventData.callback_params) {
        params.callback_params = typeof eventData.callback_params === "string"
          ? eventData.callback_params
          : JSON.stringify(eventData.callback_params);
      }
      if (eventData.partner_params) {
        params.partner_params = typeof eventData.partner_params === "string"
          ? eventData.partner_params
          : JSON.stringify(eventData.partner_params);
      }
      for (const key of ["gps_adid", "idfa", "fire_adid", "oaid", "web_uuid", "idfv", "android_id", "adid", "ip_address", "created_at_unix", "created_at"]) {
        if (eventData[key]) params[key] = eventData[key];
      }
      if (!params.created_at_unix && !params.created_at) {
        params.created_at_unix = Math.floor(Date.now() / 1000);
      }

      const body = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) body.append(k, v);
      }

      const response = await this.client.post("/event", body.toString());
      return { success: true, status: response.status, data: response.data };
    } catch (error) {
      const status = error.response?.status || 500;
      const data = error.response?.data || null;
      console.error("[Adjust S2S] sendEvent failed:", status, data || error.message);
      const err = new Error(data?.error_desc || error.message || "Failed to send event to Adjust");
      err.status = status;
      err.data = data;
      throw err;
    }
  }

  async getEventList() {
    try {
      const response = await this.analyticsClient.get("/events", {
        params: { tokens_mapping: true }
      });
      const events = Array.isArray(response.data) ? response.data : (response.data?.events || []);
      console.log('✅ getEventList success, events:', events.length);
      return events;
    } catch (error) {
      console.log('⚠️ getEventList failed:', error.response?.status, error.response?.data?.error_desc || error.message);
      return [];
    }
  }

  async resolveEventSlug(eventToken, eventName) {
    const events = await this.getEventList();
    for (const evt of events) {
      const tokens = evt.tokens || [];
      if (tokens.includes(eventToken)) {
        console.log('✅ Resolved token', eventToken, 'to slug via API:', evt.id);
        return evt.id;
      }
    }
    if (eventName) {
      console.log('✅ Resolved token', eventToken, 'to slug via name:', eventName);
      return eventName;
    }
    console.log('⚠️ No slug found for token:', eventToken, '- falling back to app-wide data');
    return null;
  }

  buildSlugMetrics(baseMetrics, slug, fallbackToStandard = false) {
    if (fallbackToStandard) {
      return baseMetrics;
    }
    const replacements = {
      events: `${slug}_events`
    };
    return baseMetrics.split(",").map(m => replacements[m] || m).join(",");
  }

  getReportRows(reportData) {
    if (!reportData) return [];
    if (Array.isArray(reportData.rows)) return reportData.rows;
    if (Array.isArray(reportData.result_set)) return reportData.result_set;
    return [];
  }

  sumRows(rows, fields) {
    return rows.reduce((summary, row) => {
      fields.forEach((field) => {
        const value = field === "revenue"
          ? parseFloat(row[field] || 0)
          : parseInt(row[field] || 0, 10);
        summary[field] = (summary[field] || 0) + (Number.isNaN(value) ? 0 : value);
      });
      return summary;
    }, {});
  }

  buildReportParams({ dimensions, metrics, start, end, country, network, campaign, limit, sort, eventToken }) {
    const params = {
      dimensions,
      metrics,
      date_period: `${start}:${end}`,
      app_token__in: this.appToken,
      format_dates: false,
      limit: 1000,
    };

    if (sort) params.sort = sort;
    if (limit) params.limit = limit;
    if (country) params.country_code__in = country.toUpperCase();
    if (network) params.network__contains = network;
    if (campaign) params.campaign__contains = campaign;
    if (eventToken) params.event_token__in = eventToken;

    return params;
  }

  async getCompleteAnalytics(params) {
    const { startDate, endDate, country, network, campaign, eventToken, eventTokenName } = params;

    try {
      const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      const end = endDate || new Date().toISOString().split("T")[0];

      const timeDimension = "day";

      // Resolve event slug for event-specific metrics
      let resolvedSlug = null;
      let eventMetric = 'events';
      let revenueMetric = 'revenue';
      if (eventToken && eventToken.trim()) {
        resolvedSlug = await this.resolveEventSlug(eventToken, eventTokenName || eventToken);
        if (resolvedSlug) {
          eventMetric = `${resolvedSlug}_events`;
          revenueMetric = `${resolvedSlug}_revenue`;
          console.log('   Resolved slug:', resolvedSlug);
          console.log('   Event metric:', eventMetric);
        }
      }

      console.log('\n🔍 Adjust API Debug: getCompleteAnalytics');
      console.log('   Date range:', `${start}:${end}`);
      console.log('   Event token filter:', eventToken || 'none');
      console.log('   Using metrics:', `${eventMetric},installs,clicks,impressions,${revenueMetric},daus`);

      const [
        kpiData,
        clickTracking,
        revenueData,
        deviceData,
        sourceData
      ] = await Promise.all([
        this.analyticsClient.get("/report", {
          params: this.buildReportParams({
            dimensions: "app,day",
            metrics: `${eventMetric},installs,clicks,impressions,${revenueMetric},daus`,
            start,
            end,
            country,
            network,
            campaign,
            eventToken,
            sort: "-day"
          })
        }).then(res => {
          console.log('✅ KPI Data Response Status:', res.status);
          console.log('   Data rows:', res.data?.rows?.length || 0);
          return res;
        }).catch(err => {
          console.log('❌ KPI Data Error:', err.response?.status, err.response?.data || err.message);
          return { error: err.message, data: null };
        }),

        this.analyticsClient.get("/report", {
          params: this.buildReportParams({
            dimensions: `app,network,campaign,adgroup,creative,country_code,country,${timeDimension}`,
            metrics: `${eventMetric},installs,clicks,impressions,${revenueMetric},daus`,
            start,
            end,
            country,
            network,
            campaign,
            eventToken,
            sort: `-${timeDimension}`
          })
        }).then(res => {
          console.log('✅ Click Tracking Response Status:', res.status);
          console.log('   Data rows:', this.getReportRows(res.data).length);
          return res;
        }).catch(err => {
          console.log('❌ Click Tracking Error:', err.response?.status, err.response?.data || err.message);
          return { error: err.message, data: null };
        }),

        this.analyticsClient.get("/report", {
          params: this.buildReportParams({
            dimensions: "app,country_code,country,network",
            metrics: `${revenueMetric},${eventMetric}`,
            start,
            end,
            country,
            network,
            campaign,
            eventToken,
            sort: `-${revenueMetric}`
          })
        }).then(res => {
          console.log('✅ Revenue Data Response Status:', res.status);
          console.log('   Data rows:', this.getReportRows(res.data).length);
          return res;
        }).catch(err => {
          console.log('❌ Revenue Data Error:', err.response?.status);
          return { error: err.message, data: null };
        }),

        this.analyticsClient.get("/report", {
          params: this.buildReportParams({
            dimensions: "app,country_code,country,os_name,device_type",
            metrics: `${eventMetric},installs,clicks,impressions,${revenueMetric},daus`,
            start,
            end,
            country,
            network,
            campaign,
            eventToken,
            sort: `-${eventMetric}`
          })
        }).then(res => {
          console.log('✅ Device Data Response Status:', res.status);
          console.log('   Data rows:', this.getReportRows(res.data).length);
          return res;
        }).catch(err => {
          console.log('❌ Device Data Error:', err.response?.status);
          return { error: err.message, data: null };
        }),

        this.analyticsClient.get("/report", {
          params: this.buildReportParams({
            dimensions: "app,network,campaign,adgroup,creative",
            metrics: `${eventMetric},installs,clicks,${revenueMetric},impressions,daus`,
            start,
            end,
            country,
            network,
            campaign,
            eventToken,
            sort: "-installs"
          })
        }).then(res => {
          console.log('✅ Source Data Response Status:', res.status);
          console.log('   Data rows:', this.getReportRows(res.data).length);
          return res;
        }).catch(err => {
          console.log('❌ Source Data Error:', err.response?.status);
          return { error: err.message, data: null };
        })
      ]);

      const analyticsData = {
        kpis: { data: kpiData.data || kpiData, error: kpiData.error || null },
        clickTracking: { data: clickTracking.data || clickTracking, error: clickTracking.error || null },
        revenue: { data: revenueData.data || revenueData, error: revenueData.error || null },
        devices: { data: deviceData.data || deviceData, error: deviceData.error || null },
        sources: { data: sourceData.data || sourceData, error: sourceData.error || null }
      };

      const summary = { totalEvents: 0, totalInstalls: 0, totalClicks: 0, totalRevenue: 0, totalImpressions: 0 };
      const kpiRows = this.getReportRows(analyticsData.kpis.data);
      if (kpiRows.length) {
        kpiRows.forEach(row => {
          summary.totalEvents += parseInt(row[eventMetric] || 0);
          summary.totalInstalls += parseInt(row.installs || 0);
          summary.totalClicks += parseInt(row.clicks || 0);
          summary.totalRevenue += parseFloat(row[revenueMetric] || 0);
          summary.totalImpressions += parseInt(row.impressions || 0);
        });
      }

      return {
        success: true,
        data: { summary, analytics: analyticsData, eventMetric, resolvedSlug, dateRange: { start, end }, filters: { country: country || null, network: network || null, campaign: campaign || null, eventToken: eventToken || null } },
        status: 200,
      };
    } catch (error) {
      console.error("Adjust getCompleteAnalytics error:", error);
      throw error;
    }
  }

  async getTokenAnalytics(params) {
    const { eventToken, eventName, startDate, endDate, country, network } = params;

    try {
      const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      const end = endDate || new Date().toISOString().split("T")[0];

      const timeDimension = "day";

      let resolvedSlug = null;

      if (eventToken) {
        resolvedSlug = await this.resolveEventSlug(eventToken, eventName);
        if (resolvedSlug) {
          console.log('   Resolved slug:', resolvedSlug);
        }
      }

      const eventMetric = resolvedSlug ? `${resolvedSlug}_events` : 'events';

      console.log('\n🔍 Adjust API Debug: getTokenAnalytics');
      console.log('   Date range:', `${start}:${end}`);
      console.log('   Token:', eventToken);
      console.log('   Slug:', resolvedSlug || 'none');
      console.log('   Event metric:', eventMetric);

      const [
        kpiData,
        byNetwork,
        byCountry,
        byDevice,
        bySource
      ] = await Promise.all([
        this.analyticsClient.get("/report", {
          params: {
            dimensions: "app,day",
            metrics: eventMetric,
            date_period: `${start}:${end}`,
            app_token__in: this.appToken,
            format_dates: false,
            limit: 1000,
            sort: "-day"
          }
        }).then(res => {
          console.log('✅ KPI Data Status:', res.status, 'Rows:', res.data?.rows?.length || 0);
          return res;
        }).catch(err => {
          console.log('❌ KPI Data Error:', err.response?.status, err.response?.data?.error_desc);
          return { error: err.message, data: null };
        }),

        this.analyticsClient.get("/report", {
          params: {
            dimensions: "app,network,campaign,day",
            metrics: eventMetric,
            date_period: `${start}:${end}`,
            app_token__in: this.appToken,
            format_dates: false,
            limit: 1000,
            sort: `-${eventMetric}`
          }
        }).then(res => {
          console.log('✅ By Network Status:', res.status, 'Rows:', res.data?.rows?.length || 0);
          return res;
        }).catch(err => {
          console.log('❌ By Network Error:', err.response?.status, err.response?.data?.error_desc);
          return { error: err.message, data: null };
        }),

        this.analyticsClient.get("/report", {
          params: {
            dimensions: "app,country_code,country",
            metrics: eventMetric,
            date_period: `${start}:${end}`,
            app_token__in: this.appToken,
            format_dates: false,
            limit: 1000,
            sort: `-${eventMetric}`
          }
        }).then(res => {
          console.log('✅ By Country Status:', res.status, 'Rows:', res.data?.rows?.length || 0);
          return res;
        }).catch(err => {
          console.log('❌ By Country Error:', err.response?.status, err.response?.data?.error_desc);
          return { error: err.message, data: null };
        }),

        this.analyticsClient.get("/report", {
          params: {
            dimensions: "app,country_code,country,os_name,device_type",
            metrics: eventMetric,
            date_period: `${start}:${end}`,
            app_token__in: this.appToken,
            format_dates: false,
            limit: 1000,
            sort: `-${eventMetric}`
          }
        }).then(res => {
          console.log('✅ By Device Status:', res.status, 'Rows:', res.data?.rows?.length || 0);
          return res;
        }).catch(err => {
          console.log('❌ By Device Error:', err.response?.status, err.response?.data?.error_desc);
          return { error: err.message, data: null };
        }),

        this.analyticsClient.get("/report", {
          params: {
            dimensions: "app,network,campaign,adgroup,creative",
            metrics: eventMetric,
            date_period: `${start}:${end}`,
            app_token__in: this.appToken,
            format_dates: false,
            limit: 1000,
            sort: `-${eventMetric}`
          }
        }).then(res => {
          console.log('✅ By Source Status:', res.status, 'Rows:', res.data?.rows?.length || 0);
          return res;
        }).catch(err => {
          console.log('❌ By Source Error:', err.response?.status, err.response?.data?.error_desc);
          return { error: err.message, data: null };
        })
      ]);

      const analyticsData = {
        kpis: { data: kpiData.data || kpiData, error: kpiData.error || null },
        byNetwork: { data: byNetwork.data || byNetwork, error: byNetwork.error || null },
        byCountry: { data: byCountry.data || byCountry, error: byCountry.error || null },
        byDevice: { data: byDevice.data || byDevice, error: byDevice.error || null },
        bySource: { data: bySource.data || bySource, error: bySource.error || null }
      };

      const kpiRows = this.getReportRows(analyticsData.kpis.data);
      let totalEvents = 0;
      kpiRows.forEach(row => {
        totalEvents += parseInt(row[eventMetric] || 0);
      });

      return {
        success: true,
        data: {
          summary: { totalEvents },
          analytics: analyticsData,
          eventToken,
          resolvedSlug,
          eventMetric,
          dateRange: { start, end },
          filters: { country: country || null, network: network || null }
        },
        status: 200,
      };
    } catch (error) {
      console.error("Adjust getTokenAnalytics error:", error);
      throw error;
    }
  }

  async getEventAnalytics(params) {
    const result = await params.eventToken
      ? this.getTokenAnalytics(params)
      : this.getCompleteAnalytics(params);
    const rows = this.getReportRows(result.data?.analytics?.kpis?.data);
    const slug = result.data?.resolvedSlug;
    const fields = slug
      ? [`${slug}_events`, `${slug}_installs`, `${slug}_clicks`, `${slug}_impressions`, `${slug}_revenue`, `${slug}_daus`]
      : ["events", "installs", "clicks", "impressions", "revenue", "daus"];
    return {
      success: true,
      data: {
        eventAnalytics: {
          rows,
          result_parameters: this.sumRows(rows, fields),
        },
      },
      status: 200,
    };
  }

  async getInstallsBySource(params) {
    const result = await params.eventToken
      ? this.getTokenAnalytics(params)
      : this.getCompleteAnalytics(params);
    const rows = this.getReportRows(result.data?.analytics?.sources?.data);
    const slug = result.data?.resolvedSlug;
    const fields = slug
      ? [`${slug}_installs`, `${slug}_revenue`, `${slug}_daus`]
      : ["installs", "revenue", "daus"];
    return {
      success: true,
      data: {
        installsBySource: {
          rows,
          result_set: rows,
          result_parameters: this.sumRows(rows, fields),
        },
      },
      status: 200,
    };
  }

  async getRevenueData(params) {
    const result = await params.eventToken
      ? this.getTokenAnalytics(params)
      : this.getCompleteAnalytics(params);
    const rows = this.getReportRows(result.data?.analytics?.revenue?.data);
    const slug = result.data?.resolvedSlug;
    const eventsKey = slug ? `${slug}_events` : 'events';
    const revenueKey = slug ? `${slug}_revenue` : 'revenue';
    const dausKey = slug ? `${slug}_daus` : 'daus';
    return {
      success: true,
      data: {
        revenueData: {
          rows,
          result_set: rows,
          result_parameters: {
            ...this.sumRows(rows, [revenueKey, eventsKey, dausKey]),
            revenue_events: rows.reduce((sum, row) => sum + parseInt(row[eventsKey] || 0, 10), 0),
          },
        },
      },
      status: 200,
    };
  }

  async getDeviceLocationData(params) {
    const result = await params.eventToken
      ? this.getTokenAnalytics(params)
      : this.getCompleteAnalytics(params);
    const rows = this.getReportRows(result.data?.analytics?.devices?.data);
    return {
      success: true,
      data: {
        deviceLocationData: {
          rows,
          devices: { result_set: rows, rows },
          locations: { result_set: rows, rows },
        },
      },
      status: 200,
    };
  }

  async getClickTrackingData(params) {
    const { clickId, startDate, endDate, country, eventToken, network } = params;
    try {
      const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const end = endDate || new Date().toISOString().split("T")[0];
      const timeDimension = "day";
      const response = await this.analyticsClient.get("/report", {
        params: this.buildReportParams({
          dimensions: `app,network,campaign,adgroup,creative,country_code,country,${timeDimension}`,
          metrics: "events,installs,clicks,revenue",
          start,
          end,
          country,
          network,
          sort: `-${timeDimension}`,
          limit: 1000
        })
      });
      return { success: true, data: response.data, status: response.status };
    } catch (error) {
      console.error("Adjust getClickTrackingData error:", error);
      throw error;
    }
  }

  async getClickDetails(clickId, startDate, endDate) {
    try {
      const start = startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const end = endDate || new Date().toISOString().split("T")[0];
      const timeDimension = "day";
      const response = await this.analyticsClient.get("/report", {
        params: this.buildReportParams({
          dimensions: `app,network,campaign,adgroup,creative,country_code,country,${timeDimension}`,
          metrics: "events,installs,clicks,revenue",
          start,
          end,
          sort: timeDimension,
          limit: 10000
        })
      });

      const rows = this.getReportRows(response.data);
      const summary = {
        totalRecords: rows.length,
        totalRevenue: rows.reduce((sum, r) => sum + parseFloat(r.revenue || 0), 0),
        totalInstalls: rows.reduce((sum, r) => sum + parseInt(r.installs || 0), 0),
        totalEvents: rows.reduce((sum, r) => sum + parseInt(r.events || 0), 0),
        totalClicks: rows.reduce((sum, r) => sum + parseInt(r.clicks || 0), 0)
      };

      return {
        success: true,
        data: {
          clickId,
          summary,
          timeline: rows.map(row => ({
            activityKind: parseInt(row.installs || 0, 10) > 0 ? "install" : parseInt(row.clicks || 0, 10) > 0 ? "click" : "event",
            timestamp: row.day || row.hour,
            date: row.day || row.hour,
            network: row.network || 'Organic',
            campaign: row.campaign || 'N/A',
            adgroup: row.adgroup || 'N/A',
            creative: row.creative || 'N/A',
            country: row.country_code || row.country || 'N/A',
            revenue: parseFloat(row.revenue || 0),
            installs: parseInt(row.installs || 0),
            clicks: parseInt(row.clicks || 0),
            events: parseInt(row.events || 0)
          })),
          attributionInfo: {
            network: rows[0]?.network_name || rows[0]?.network || 'Organic',
            campaign: rows[0]?.campaign || 'N/A',
            country: rows[0]?.country || 'N/A'
          },
          rawData: rows
        },
        status: 200
      };
    } catch (error) {
      console.error("Adjust getClickDetails error:", error);
      throw error;
    }
  }

  /**
   * Get attribution table data directly from Adjust Report Service API
   * This is the RECOMMENDED approach per Adjust documentation
   * 
   * @param {Object} params - Query parameters
   * @param {string} params.startDate - Start date (YYYY-MM-DD)
   * @param {string} params.endDate - End date (YYYY-MM-DD)
   * @param {string} params.source - Filter by network (optional)
   * @param {string} params.country - Filter by country code (optional)
   * @returns {Object} Attribution table data with installs, D1 retention, revenue, cost, margin
   */
  /**
   * SEPARATE FUNCTION: Get attribution table data DIRECTLY from Adjust Report Service API
   * This function is COMPLETELY SEPARATE from webhook/event management logic
   * 
   * @param {Object} params - Query parameters
   * @param {string} params.startDate - Start date (YYYY-MM-DD)
   * @param {string} params.endDate - End date (YYYY-MM-DD)
   * @param {string} params.source - Filter by network (optional)
   * @param {string} params.country - Filter by country code (optional)
   * @returns {Object} Attribution table data with installs, revenue, marketing cost
   * 
   * VERIFIED FIELDS FROM ADJUST OFFICIAL DOCUMENTATION:
   * ✅ installs - Metric ID: 'installs' (https://dev.adjust.com/en/api/rs-api/reports/)
   * ✅ revenue - Metric ID: 'revenue' (https://help.adjust.com/en/article/datascape-metrics-glossary)
   * ✅ network_cost - Metric ID: 'network_cost' (https://dev.adjust.com/en/api/rs-api/filters-data/)
   * ✅ clicks - Metric ID: 'clicks' (standard metric)
   * ✅ impressions - Metric ID: 'impressions' (standard metric)
   * ✅ network - Dimension: 'network' (https://help.adjust.com/en/article/datascape-dimensions-glossary)
   * ❌ d1_retention - NOT in standard API (requires cohort_period=1)
   * ❌ reward_cost - NOT tracked by Adjust (use our DB if needed)
   */
  async getAttributionTableData(params = {}) {
    const { startDate, endDate, source, country } = params;

    try {
      const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const end = endDate || new Date().toISOString().split("T")[0];

      console.log('\n📊 Adjust API: Fetching attribution table data (SEPARATE FUNCTION)');
      console.log(`   Date range: ${start} to ${end}`);
      if (source) console.log(`   Filter by network: ${source}`);
      if (country) console.log(`   Filter by country: ${country}`);

      // Build API params for Adjust Report Service
      // Using JSON endpoint: https://automate.adjust.com/reports-service/report
      // VERIFIED metric names from official Adjust documentation:
      // - installs ✅ (https://dev.adjust.com/en/api/rs-api/reports/)
      // - revenue ✅ (https://help.adjust.com/en/article/datascape-metrics-glossary)
      // - network_cost ✅ (https://dev.adjust.com/en/api/rs-api/filters-data/)
      // - clicks ✅ (standard metric)
      // - impressions ✅ (standard metric)
      const apiParams = {
        dimensions: 'network,campaign,country_code',
        metrics: 'installs,revenue,network_cost,clicks,impressions',
        date_period: `${start}:${end}`,
        app_token__in: this.appToken,
        format_dates: false,
        sort: '-installs',
        limit: 1000
      };

      if (source) {
        apiParams.network__contains = source;
      }
      if (country) {
        apiParams.country_code__in = country.toUpperCase();
      }

      const response = await this.analyticsClient.get('/report', { params: apiParams });

      if (!response.data) {
        console.log('⚠️ Adjust API: No data returned');
        return { success: true, data: [], source: 'adjust_api', count: 0 };
      }

      const rows = this.getReportRows(response.data);
      console.log(`✅ Adjust API: Got ${rows.length} rows`);

      // Transform to attribution table format
      // ALL FIELDS BELOW ARE VERIFIED AGAINST ADJUST OFFICIAL DOCUMENTATION
      const attributionData = rows.map((row, index) => {
        // ✅ VERIFIED: installs (metric 'installs' from Adjust docs)
        const installs = parseInt(row.installs || 0, 10);
        
        // ✅ VERIFIED: revenue (metric 'revenue' from Adjust docs)
        // Official doc: "The revenue your app has generated within a selected timeframe"
        const revenue = parseFloat(row.revenue || 0);
        
        // ✅ VERIFIED: marketingCost (metric 'network_cost' from Adjust docs)
        // Official doc: "Ad Spend (Network) - shows ad spend data retrieved using Network API"
        const marketingCost = parseFloat(row.network_cost || 0);
        
        // ❌ NOT AVAILABLE: D1/D7 Retention
        // Official doc: retention_rate_{N} requires cohort_period parameter (Cohort API)
        // Setting to 0 - can be calculated from DB later if needed
        const d1Retention = 0;
        const d7Retention = 0;
        
        // ❌ COMMENTED OUT: Reward Cost (NOT tracked by Adjust)
        // Adjust only tracks ad spend (network_cost), NOT your internal reward costs
        // If needed, query our Transaction collection separately
        const rewardCost = 0; // Commented out as requested
        
        // FIXED: Margin includes marketingCost (Bug 3 fix from senior dev)
        const margin = revenue - marketingCost; // rewardCost is 0
        const marginPercent = revenue > 0 ? ((margin / revenue) * 100).toFixed(2) : 0;

        return {
          id: index + 1,
          source: row.network || 'Organic', // ✅ VERIFIED: dimension 'network'
          campaign: row.campaign || 'N/A', // ✅ VERIFIED: dimension 'campaign'
          country: row.country_code || 'N/A', // ✅ VERIFIED: dimension 'country_code'
          installs: installs, // ✅ From Adjust API
          d1Retention: d1Retention, // ❌ Not from Adjust (0 for now)
          d7Retention: d7Retention, // ❌ Not from Adjust (0 for now)
          revenue: revenue, // ✅ From Adjust API (metric 'revenue')
          rewardCost: rewardCost, // ❌ Commented out (0 for now)
          marketingCost: marketingCost, // ✅ From Adjust API (metric 'network_cost')
          margin: margin,
          marginPercent: parseFloat(marginPercent),
          clicks: parseInt(row.clicks || 0, 10), // ✅ From Adjust API
          impressions: parseInt(row.impressions || 0, 10) // ✅ From Adjust API
        };
      });

      if (attributionData.length === 0) {
        console.log('⚠️ Adjust API: No attribution data found for the given filters');
      }

      return {
        success: true,
        data: attributionData,
        source: 'adjust_api',
        count: attributionData.length,
        dateRange: { start, end },
        filters: { source: source || null, country: country || null }
      };

    } catch (error) {
      console.error('❌ Adjust API error (getAttributionTableData):', error.response?.status, error.response?.data || error.message);
      
      return {
        success: false,
        data: [],
        source: 'adjust_api',
        count: 0,
        error: error.message
      };
    }
  }
}

// ===========================================================================
// ===========================================================================
// NEW METHODS: Get Networks & Campaigns for Dropdown Auto-Population
// ===========================================================================

/**
 * Get all unique networks (marketing channels) from Adjust API
 * @param {Object} params - Optional filters
 * @param {boolean} forceRefresh - Force refresh cache
 * @returns {Promise<Array>} List of network names
 */
async function getNetworksForDropdown(params = {}, forceRefresh = false) {
  try {
    console.log('\n🔍 Adjust API: Fetching networks from filters_data endpoint');
    
    const response = await this.analyticsClient.get('/filters_data', {
      params: { required_filters: 'networks' }
    });

    const networksData = response.data?.networks || [];
    
    const networks = networksData
      .map(n => n.name || n.id)
      .filter(Boolean)
      .sort();

    console.log(`✅ Adjust API (filters_data): Got ${networks.length} networks after filtering`);
    
    if (networks.length > 0) return networks;
    
    // No networks found from API or DB
    console.log('⚠️ No paid networks found from API or DB, returning empty list');
    return [];
  } catch (error) {
    console.error('❌ Adjust API error (getNetworksForDropdown):', error.response?.status, error.response?.data || error.message);
    
    // Fallback to DB
    try {
      const AdjustCallback = require('../models/AdjustCallback');
      const dbNetworks = await AdjustCallback.distinct('network', { 
        network: { $exists: true, $ne: '' } 
      });
      const filtered = dbNetworks
        .filter(n => n && n.trim())
        .sort();
      
      if (filtered.length > 0) return filtered;
    } catch (dbError) {
      console.error('❌ DB Fallback error:', dbError.message);
    }
    
    // No networks from API or DB
    console.log('⚠️ No networks found from any source');
    return [];
  }
}

/**
 * Get all unique campaigns from Adjust API
 * @param {Object} params - Optional filters
 * @param {string} params.network - Filter by network (optional)
 * @param {boolean} forceRefresh - Force refresh cache
 * @returns {Promise<Array>} List of campaign names
 */
async function getCampaignsForDropdown(params = {}, forceRefresh = false) {
  try {
    console.log('\n🔍 Adjust API: Fetching campaigns from Report API');
    
    const { network } = params;
    const datePeriod = '2024-01-01:2026-12-31'; // Wide range to capture all campaigns
    
    const response = await this.analyticsClient.get('/report', {
      params: {
        dimensions: 'campaign_network,network',
        metrics: 'installs',
        date_period: datePeriod,
        app_token__in: this.appToken,
        format_dates: false,
        limit: 1000
      }
    });

    const rows = this.getReportRows(response.data);

    let campaigns = [...new Set(
      rows
        .filter(row => row.network)
        .map(row => row.campaign_network || row.campaign)
        .filter(Boolean)
    )].sort();

    console.log(`✅ Adjust Report API: Got ${campaigns.length} campaigns`);
    
    if (campaigns.length > 0) return campaigns;
  } catch (error) {
    console.error('❌ Adjust Report API error:', error.response?.status, error.response?.data || error.message);
  }
  
  // Return sample campaigns as fallback
  console.log('⚠️ No campaigns found from API, returning empty list');
  return [];
   }

// Attach methods to AdjustService prototype
AdjustService.prototype.getNetworksForDropdown = getNetworksForDropdown;
AdjustService.prototype.getCampaignsForDropdown = getCampaignsForDropdown;

module.exports = new AdjustService();
