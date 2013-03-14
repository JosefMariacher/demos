// ==========================================================================
// Project:   BigData
// Copyright: ©2013 7x7 Software, Inc.
// License:   Licensed under MIT license
// ==========================================================================
/*global BigData */


/** @singleton
  This object acts as the delegate for the sparse array of store keys
  backing the array of Person records.

  Whenever a record is requested that hasn't yet been loaded, the sparse
  array will notify this delegate, which will fetch it from the server.

  Note: You can make the data source the delegate, but because there may be
  multiple sparse arrays, it's nice to keep each delegate as its own object.
*/
BigData.flatArrayDelegate = SC.Object.create({

  /** @private SC.SparseArrayDelegate protocol */
  sparseArrayDidRequestRange: function (sparseArray, range) {
    var page,
      path,
      query = sparseArray.get('query'),
      rangeWindowSize = sparseArray.get('rangeWindowSize'),
      recArray,
      request,
      start = range.start,
      store = sparseArray.get('store');

    // Because this is a demo, we don't have a real server to feed results.
    // Instead we use a bunch of pre-built static JSON files that we can request
    // as though they were being generated by the server.
    //
    // These files are built into the project, so in order to get the path to
    // any certain page we just have to cache the path to one of the files and
    // adjust it to match the page we're looking for.
    page = start / rangeWindowSize + 1;
    path = sc_static('people_1.json');
    path = path.replace('_1', '_' + page);

    // We don't actually use this, but if we had a real server we'd probably
    // need params like this.
    path = path + '?start=%@&length=%@'.fmt(start, range.length);

    // Generate the request and send it.
    request = SC.Request.getUrl(path)
      .json(true)
      .notify(this, this._requestCompleted, {
        sparseArray: sparseArray,
        range: range,
        query: query,
        store: store
      })
      .send();

    // Since the record array doesn't know that we are paging in data behind
    // the scenes, we'll tell it each time its results are updating.  This
    // will put it in a BUSY_REFRESH state.  This is particularly useful
    // if we want the UI to indicate that more results are loading.
    recArray = store.find(query);
    recArray.storeWillFetchQuery(query);

    SC.info('sparseArrayDidRequestRange: %@ - %@ (people_%@.json) - flat data source'.fmt(start, start + range.length - 1, page));
  },

  /** @private SC.SparseArrayDelegate protocol */
  sparseArrayDidReset: function (sparseArray) {
    // Empty it out.  This is for demo purposes, we completely clear out the
    // sparse array when changing data sources.
    // sparseArray.provideLength(0);
  },

  /** @private Callback for sparseArrayDidRequestRange method. */
  _requestCompleted: function (response, params) {
    var body,
      failed = true,
      query = params.query,
      recordType,
      results,
      store = params.store,
      storeKeys;

    if (SC.ok(response)) {
      recordType = query.recordType;

      var range = params.range,
        sparseArray = params.sparseArray,
        start;

      // Load the data into the store.
      body = response.get('body');
      results = body.people;
      storeKeys = store.loadRecords(recordType, results);

      // Update the sparse array.
      start = range.start;

      sparseArray.provideObjectsInRange({ start: start, length: results.length }, storeKeys);  // What we just added.
      sparseArray.provideLength(body.totalCount);  // Total length (not just what we got this fetch)
      sparseArray.rangeRequestCompleted(start);

      // Update the results of the query in order to set the RecordArray
      // status back to READY.
      store.loadQueryResults(query, sparseArray);

      SC.info('   _requestCompleted: %@ - %@'.fmt(start, start + results.length - 1));

      failed = false;
    }

    // Typically you would want to throw some kind of error message here or retry.
    if (failed) {
      SC.error("Unable to retrieve range: %@".fmt(query));
      store.dataSourceDidErrorQuery(query, response);
    }
  }

});


/** @singleton
  This data source pages in data from the server as necessary without
  attempting to group the data or unload it.

  @extends DataSource
*/
BigData.flatDataSource = SC.DataSource.create({

  /**
    Fetch is called when someone runs a query on the store.
  */
  fetch: function (store, query) {
    var handled = false,
      recordType = query.recordType,
      sparseArray;

    // We handle the request if we're the active data source.
    if (recordType === BigData.Person && query.targetDataSource === 'flatDataSource') {
      // We will create a sparse array for the store keys so that we can page in
      // data lazily as necessary. We use 100 as the rangeWindowSize, because
      // our simulated server responses are always 100 items long.
      sparseArray = SC.SparseArray.create({
        delegate: BigData.flatArrayDelegate,
        query: query,
        rangeWindowSize: 100,
        store: store
      });

      // Requesting the first index will start loading the initial range of
      // records immediately.
      sparseArray.requestIndex(0);

      // Indicate that we took this request.
      handled = true;
    }

    return handled;
  }

});
