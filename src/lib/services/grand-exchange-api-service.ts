import type * as Types from '../models/grand-exchange-protocols';

const headers = {
    'User-Agent':
        'npm runelite | aris-maye | Helps OSRS players turn their skilling processes into more valuable ' +
        'ventures. | Contact: me@jaiden.foo',
};

const fetchData = async (url: RequestInfo | URL) => {
    const response = await fetch(url, { headers });
    return await response.json();
};

/**
 * Get the latest high and low prices for the items that we have data for,
 * and the Unix timestamp when that transaction took place
 * @param id - (optional) Item ID. If provided, will only display the latest price for this item.
 * @returns An associative array object.
 * @see https://oldschool.runescape.wiki/w/RuneScape:Real-time_Prices
 */
export const latest = async (id?: number): Promise<Types.FullTransactionData> => {
    const url = id
        ? `https://prices.runescape.wiki/api/v1/osrs/latest?id=${id}`
        : `https://prices.runescape.wiki/api/v1/osrs/latest`;

    // return (await axios.get<{ data: any }>(url, { headers })).data.data;
    const response = await fetchData(url);
    return response.data as Types.FullTransactionData;
};

// Mapping does not need to be updated often, so we can cache it.
const mappingCache: Types.FullMap = {};

/**
 * Gives a list of objects containing the name,
 * id, examine text, members status, lowalch, highalch,
 * GE buy limit, icon file name (on the wiki).
 *
 * The mapping is not updated often, so it is cached.
 * @returns An associative array object.
 * @see https://oldschool.runescape.wiki/w/RuneScape:Real-time_Prices
 */
export const mapping = async (): Promise<Types.FullMap> => {
    const cached = Object.keys(mappingCache).length > 0;
    const url = 'https://prices.runescape.wiki/api/v1/osrs/mapping';

    if (!cached) {
        const response = (await fetchData(url)) as Types.MapData[];
        response.forEach((item) => (mappingCache[item.id] = item));
    }

    return mappingCache;
};

/**
 * Gets the data from latest() and mapping() and combines them into MapData objects with added highValue and lowValue
 * properties.
 * @returns
 */
export const geDataCombined = async (): Promise<Types.FullMapDataCombined> => {
    const geData = {} as Types.FullMapDataCombined;
    const latestPrices = await latest();
    const itemMapping = await mapping();

    Object.keys(latestPrices).forEach((itemId: string) => {
        const highPrice = latestPrices[itemId].high;
        const highTime = latestPrices[itemId].highTime;
        const lowPrice = latestPrices[itemId].low;
        const lowTime = latestPrices[itemId].lowTime;
        geData[itemId] = { ...itemMapping[itemId], highPrice, highTime, lowPrice, lowTime };
    });

    return geData;
};

/**
 * Gives 5- or 60-minute average of item high and low prices as well as the number traded
 * for the items that we have data on. Comes with a Unix timestamp indicating the block the data is from.
 * @param options {Types.PricesOptions} The options to use for this function.
 * @returns An associative array object.
 * @see https://oldschool.runescape.wiki/w/RuneScape:Real-time_Prices
 */
export const prices = async (options: Types.PricesOptions): Promise<Types.TimeSeriesData> => {
    const { timestamp } = options || {};

    let { timestep } = options || {};
    if (timestep) timestep = timestep.toLowerCase() as '5m' | '1h';

    if (timestep !== '5m' && timestep !== '1h')
        console.error("interval must be '5m' or '1h'. Falling back to 5min, in future, this will be an error.");

    timestep = timestep ?? '5m';

    const url = timestamp
        ? `https://prices.runescape.wiki/api/v1/osrs/${timestep}?timestamp=${timestamp}`
        : `https://prices.runescape.wiki/api/v1/osrs/${timestep}`;

    const response = await fetchData(url);

    Object.keys(response.data).forEach((key) => {
        response.data[key].timestamp = response.timestamp;
    });

    return response.data;
};

/**
 * Gives a list of the high and low prices of item with the given id at the given interval, up to 300 maximum.
 * @param options {Types.TimeSeriesOptions} The options to use for this function.
 * @returns A timeseries array.
 * @see https://oldschool.runescape.wiki/w/RuneScape:Real-time_Prices
 */
export const timeseries = async (options: Types.TimeSeriesOptions): Promise<Types.TimeSeriesDataPoint[]> => {
    const { timestep, id } = options || {};

    const url = `https://prices.runescape.wiki/api/v1/osrs/timeseries?timestep=${timestep}&id=${id}`;

    const response = await fetchData(url);

    const payload = response?.data ?? response;
    const dataField = payload?.data ?? payload;

    if (Array.isArray(dataField)) return dataField as Types.TimeSeriesDataPoint[];

    if (dataField && typeof dataField === 'object') {
        const keyed = dataField as Record<string, unknown>;
        const idKey = id?.toString() ?? '';
        const series = keyed[idKey];

        if (Array.isArray(series)) return series as Types.TimeSeriesDataPoint[];

        const firstValue = Object.values(keyed)[0];
        if (Array.isArray(firstValue)) return firstValue as Types.TimeSeriesDataPoint[];
    }

    console.warn('Timeseries: missing data', { id, timestep, responseSample: payload?.data ?? payload });
    return [];
};
