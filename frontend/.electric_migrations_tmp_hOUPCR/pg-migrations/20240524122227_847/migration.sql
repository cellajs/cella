CREATE TABLE tasks (
    id character varying NOT NULL,
    slug character varying NOT NULL,
    markdown character varying,
    summary character varying NOT NULL,
    type character varying NOT NULL,
    impact integer,
    sort_order integer,
    status integer NOT NULL,
    project_id character varying NOT NULL,
    created_at timestamp without time zone NOT NULL,
    created_by character varying NOT NULL,
    assigned_by character varying,
    assigned_at timestamp without time zone,
    modified_at timestamp without time zone,
    modified_by character varying,
    CONSTRAINT tasks_pkey PRIMARY KEY (id)
);

CREATE TABLE labels (
    id character varying NOT NULL,
    name character varying NOT NULL,
    color character varying,
    project_id character varying NOT NULL,
    CONSTRAINT labels_pkey PRIMARY KEY (id)
);